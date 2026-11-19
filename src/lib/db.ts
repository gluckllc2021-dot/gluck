import fs from "fs";
import path from "path";
import { DatabaseSync } from "node:sqlite";
import { createClient, type Client, type InValue, type Transaction } from "@libsql/client";
import type { Ledger, ReviewEvent } from "./attendance";

type Sql = {
  exec(sql: string): Promise<void>;
  get(sql: string, args?: unknown[]): Promise<Record<string, unknown> | undefined>;
  all(sql: string, args?: unknown[]): Promise<Record<string, unknown>[]>;
  run(sql: string, args?: unknown[]): Promise<void>;
};

type Connection = Sql & {
  transaction<T>(fn: (db: Sql) => Promise<T>): Promise<T>;
};

const globalForDb = globalThis as unknown as { gluckDb?: Connection; gluckDbKind?: string };

export type Role = "admin" | "editor" | "viewer";

export type UserRow = {
  id: string;
  email: string;
  name: string;
  role: Role;
  password_hash: string;
  created_at: string;
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin','editor','viewer')),
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  day TEXT NOT NULL,
  at TEXT NOT NULL,
  payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS events_day ON events(day);
`;

export function tursoEnabled() {
  return Boolean(process.env.TURSO_DATABASE_URL?.trim() && process.env.TURSO_AUTH_TOKEN?.trim());
}

function tursoSettings() {
  const url = process.env.TURSO_DATABASE_URL?.trim() || "";
  const authToken = process.env.TURSO_AUTH_TOKEN?.trim() || "";
  if (!url && !authToken) return null;
  if (!url || !authToken) {
    throw new Error("TURSO_DATABASE_URL と TURSO_AUTH_TOKEN は、両方入れてください。片方だけだと接続先が決まりません。");
  }
  return { url, authToken };
}

function asRecord(row: unknown): Record<string, unknown> | undefined {
  if (!row || typeof row !== "object") return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (/^\d+$/.test(key)) continue;
    out[key] = typeof value === "bigint" ? Number(value) : value;
  }
  return out;
}

function sqliteConnection(db: DatabaseSync): Connection {
  const sql: Sql = {
    async exec(statement) {
      db.exec(statement);
    },
    async get(statement, args = []) {
      return asRecord(db.prepare(statement).get(...(args as never[])));
    },
    async all(statement, args = []) {
      return db.prepare(statement).all(...(args as never[])).map((item) => asRecord(item)!);
    },
    async run(statement, args = []) {
      db.prepare(statement).run(...(args as never[]));
    },
  };
  return {
    ...sql,
    async transaction(fn) {
      db.exec("BEGIN");
      try {
        const result = await fn(sql);
        db.exec("COMMIT");
        return result;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
  };
}

function libsqlConnection(client: Client | Transaction): Sql {
  return {
    async exec(statement) {
      await client.execute(statement);
    },
    async get(statement, args = []) {
      const result = await client.execute({ sql: statement, args: args as InValue[] });
      return asRecord(result.rows[0]);
    },
    async all(statement, args = []) {
      const result = await client.execute({ sql: statement, args: args as InValue[] });
      return result.rows.map((item) => asRecord(item)!);
    },
    async run(statement, args = []) {
      await client.execute({ sql: statement, args: args as InValue[] });
    },
  };
}

function libsqlRoot(client: Client): Connection {
  const sql = libsqlConnection(client);
  return {
    ...sql,
    async transaction(fn) {
      const tx = await client.transaction("write");
      try {
        const result = await fn(libsqlConnection(tx));
        await tx.commit();
        return result;
      } catch (error) {
        await tx.rollback();
        throw error;
      }
    },
  };
}

function serialized(inner: Connection): Connection {
  let chain = Promise.resolve();
  const enqueue = <T>(fn: () => Promise<T>) => {
    const run = chain.then(fn, fn);
    chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
  return {
    exec: (sql) => enqueue(() => inner.exec(sql)),
    get: (sql, args) => enqueue(() => inner.get(sql, args)),
    all: (sql, args) => enqueue(() => inner.all(sql, args)),
    run: (sql, args) => enqueue(() => inner.run(sql, args)),
    transaction: (fn) => enqueue(() => inner.transaction(fn)),
  };
}

async function openDatabase(): Promise<Connection> {
  const remote = tursoSettings();
  if (remote) {
    const client = createClient({ url: remote.url, authToken: remote.authToken });
    await client.executeMultiple(SCHEMA);
    const db = serialized(libsqlRoot(client));
    return db;
  }
  const dir = process.env.GLUCK_DATA_DIR || path.join(process.cwd(), "data");
  fs.mkdirSync(dir, { recursive: true });
  const file = new DatabaseSync(path.join(dir, "gluck.sqlite"));
  const db = serialized(sqliteConnection(file));
  await db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  await db.exec(SCHEMA);
  return db;
}

async function database() {
  if (!globalForDb.gluckDb || globalForDb.gluckDbKind !== "adapter-v1" || typeof globalForDb.gluckDb.all !== "function") {
    const stale = globalForDb.gluckDb as { close?: () => void } | undefined;
    try {
      stale?.close?.();
    } catch {
      /* 古い接続は閉じて捨てる */
    }
    globalForDb.gluckDb = await openDatabase();
    globalForDb.gluckDbKind = "adapter-v1";
  }
  return globalForDb.gluckDb;
}

function text(row: Record<string, unknown> | undefined, key: string) {
  const value = row?.[key];
  return value == null ? null : String(value);
}

async function metaGet(db: Sql, key: string) {
  const found = await db.get("SELECT value FROM meta WHERE key = ?", [key]);
  return text(found, "value");
}

async function metaSet(db: Sql, key: string, value: string) {
  await db.run("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [key, value]);
}

export async function getMeta(key: string) {
  return metaGet(await database(), key);
}

export async function setMeta(key: string, value: string) {
  await metaSet(await database(), key, value);
}

function userFrom(row: Record<string, unknown> | undefined): UserRow | null {
  if (!row) return null;
  return {
    id: String(row.id),
    email: String(row.email),
    name: String(row.name),
    role: String(row.role) as Role,
    password_hash: String(row.password_hash),
    created_at: String(row.created_at),
  };
}

export async function listUsers() {
  const rows = await (await database()).all("SELECT id, email, name, role, password_hash, created_at FROM users ORDER BY created_at");
  return rows.map((item) => userFrom(item)!);
}

export async function findUserByEmail(email: string) {
  const row = await (await database()).get("SELECT id, email, name, role, password_hash, created_at FROM users WHERE email = ?", [email.toLowerCase()]);
  return userFrom(row);
}

export async function findUserById(id: string) {
  const row = await (await database()).get("SELECT id, email, name, role, password_hash, created_at FROM users WHERE id = ?", [id]);
  return userFrom(row);
}

export async function insertUser(user: UserRow) {
  await (await database()).run(
    "INSERT INTO users (id, email, name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    [user.id, user.email.toLowerCase(), user.name, user.password_hash, user.role, user.created_at],
  );
}

export async function updateUser(id: string, patch: { name?: string; role?: Role; password_hash?: string }) {
  const current = await findUserById(id);
  if (!current) return;
  await (await database()).run("UPDATE users SET name = ?, role = ?, password_hash = ? WHERE id = ?", [
    patch.name ?? current.name,
    patch.role ?? current.role,
    patch.password_hash ?? current.password_hash,
    id,
  ]);
}

export async function deleteUser(id: string) {
  await (await database()).run("DELETE FROM users WHERE id = ?", [id]);
}

export async function createSession(tokenHash: string, userId: string, expiresAt: number) {
  await (await database()).run("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)", [tokenHash, userId, expiresAt]);
}

export async function deleteSession(tokenHash: string) {
  await (await database()).run("DELETE FROM sessions WHERE token_hash = ?", [tokenHash]);
}

export async function userByToken(tokenHash: string) {
  const row = await (await database()).get(
    `SELECT u.id, u.email, u.name, u.role, u.password_hash, u.created_at
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ?`,
    [tokenHash, Date.now()],
  );
  return userFrom(row);
}

export async function getLedger(): Promise<Ledger | null> {
  const raw = await getMeta("ledger");
  if (!raw || raw === "null") return null;
  return JSON.parse(raw) as Ledger;
}

export async function getRevision() {
  return Number((await getMeta("revision")) ?? "0");
}

export async function listEvents(): Promise<ReviewEvent[]> {
  const rows = await (await database()).all("SELECT payload FROM events ORDER BY at, id");
  return rows.map((item) => JSON.parse(String(item.payload)) as ReviewEvent);
}

export async function countEvents() {
  const found = await (await database()).get("SELECT COUNT(*) AS n FROM events");
  return Number(found?.n ?? 0);
}

export async function replaceLedger(ledger: Ledger, events: ReviewEvent[] | null) {
  const db = await database();
  await db.transaction(async (tx) => {
    await metaSet(tx, "ledger", JSON.stringify(ledger));
    if (events) {
      await tx.exec("DELETE FROM events");
      for (const event of events) {
        await tx.run("INSERT INTO events (id, day, at, payload) VALUES (?, ?, ?, ?)", [event.id, event.day, event.at, JSON.stringify(event)]);
      }
      await metaSet(tx, "revision", String(events.length));
    } else if (!(await metaGet(tx, "revision"))) {
      await metaSet(tx, "revision", "0");
    }
    await metaSet(tx, "imported_at", new Date().toISOString());
  });
}

export async function appendEvent(event: ReviewEvent, previousId: string | null, expectedRevision: number) {
  const db = await database();
  return db.transaction(async (tx) => {
    const revision = Number((await metaGet(tx, "revision")) ?? "0");
    const rows = await tx.all("SELECT id FROM events ORDER BY at, id");
    const lastId = rows.at(-1)?.id ? String(rows.at(-1)?.id) : null;
    if (revision !== expectedRevision || lastId !== previousId) return { ok: false as const };
    await tx.run("INSERT INTO events (id, day, at, payload) VALUES (?, ?, ?, ?)", [event.id, event.day, event.at, JSON.stringify(event)]);
    await metaSet(tx, "revision", String(revision + 1));
    return { ok: true as const, revision: revision + 1 };
  });
}

export type StoredSheet = {
  id: string;
  spreadsheetId: string;
  url: string;
  title: string;
  month: string;
  mappings: { tab: string; projectName: string; region: string; include: boolean; discovered?: boolean }[];
  lastSyncAt: string | null;
  lastOk: boolean;
  lastMessage: string;
  lastWarningCount: number;
};

export async function listSheets(): Promise<StoredSheet[]> {
  const raw = await getMeta("sheets");
  return raw ? (JSON.parse(raw) as StoredSheet[]) : [];
}

export async function saveSheets(sheets: StoredSheet[]) {
  await setMeta("sheets", JSON.stringify(sheets));
}

export async function syncIntervalMinutes() {
  return Number((await getMeta("syncIntervalMinutes")) || "5");
}

export async function setSyncIntervalMinutes(minutes: number) {
  await setMeta("syncIntervalMinutes", String(minutes));
}

export async function listMonthLedgers(year?: string): Promise<{ month: string; ledger: Ledger }[]> {
  const rows = await (await database()).all("SELECT key, value FROM meta WHERE key LIKE 'ledger:%'");
  const found: { month: string; ledger: Ledger }[] = [];
  for (const item of rows) {
    const month = String(item.key).slice("ledger:".length);
    if (!/^\d{4}-\d{2}$/.test(month)) continue;
    if (year && !month.startsWith(year)) continue;
    if (!item.value || item.value === "null") continue;
    found.push({ month, ledger: JSON.parse(String(item.value)) as Ledger });
  }
  found.sort((a, b) => a.month.localeCompare(b.month));
  return found;
}

export async function getLedgerForDate(date: string): Promise<Ledger | null> {
  const month = date.slice(0, 7);
  const raw = await getMeta(`ledger:${month}`);
  if (raw && raw !== "null") return JSON.parse(raw) as Ledger;
  const current = await getLedger();
  if (current?.as.slice(0, 7) === month) return current;
  return null;
}

export async function saveMonthLedger(month: string, ledger: Ledger, primary = false) {
  await setMeta(`ledger:${month}`, JSON.stringify(ledger));
  if (primary) await setMeta("ledger", JSON.stringify(ledger));
}

export async function replaceEventList(events: ReviewEvent[]) {
  const db = await database();
  await db.transaction(async (tx) => {
    await tx.exec("DELETE FROM events");
    for (const event of events) {
      await tx.run("INSERT INTO events (id, day, at, payload) VALUES (?, ?, ?, ?)", [event.id, event.day, event.at, JSON.stringify(event)]);
    }
    const revision = Number((await metaGet(tx, "revision")) || "0") + 1;
    await metaSet(tx, "revision", String(revision));
  });
}

export type SyncState = { at: string | null; ok: boolean; message: string; warningCount: number };

export async function getSyncState(): Promise<SyncState> {
  const raw = await getMeta("lastSync");
  return raw ? (JSON.parse(raw) as SyncState) : { at: null, ok: true, message: "未同期", warningCount: 0 };
}

export async function setSyncState(state: SyncState) {
  await setMeta("lastSync", JSON.stringify(state));
}

export async function getSheetAlerts(): Promise<{ level: string; code: string; tab: string; project: string; message: string }[]> {
  const raw = await getMeta("sheetAlerts");
  return raw ? (JSON.parse(raw) as { level: string; code: string; tab: string; project: string; message: string }[]) : [];
}

export async function setSheetAlerts(alerts: { level: string; code: string; tab: string; project: string; message: string }[]) {
  await setMeta("sheetAlerts", JSON.stringify(alerts));
}
