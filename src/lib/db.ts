import fs from "fs";
import path from "path";
import { DatabaseSync } from "node:sqlite";
import type { Ledger, ReviewEvent } from "./attendance";

type Sql = DatabaseSync;

const globalForDb = globalThis as unknown as { gluckDb?: Sql };

export type Role = "admin" | "editor" | "viewer";

export type UserRow = {
  id: string;
  email: string;
  name: string;
  role: Role;
  password_hash: string;
  created_at: string;
};

function database() {
  if (!globalForDb.gluckDb) {
    const dir = path.join(process.cwd(), "data");
    fs.mkdirSync(dir, { recursive: true });
    const db = new DatabaseSync(path.join(dir, "gluck.sqlite"));
    db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
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
    `);
    globalForDb.gluckDb = db;
  }
  return globalForDb.gluckDb;
}

function row<T>(value: unknown): T {
  return { ...(value as object) } as T;
}

export function getMeta(key: string) {
  const found = database().prepare("SELECT value FROM meta WHERE key = ?").get(key) as { value?: string } | undefined;
  return found?.value ?? null;
}

export function setMeta(key: string, value: string) {
  database().prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}

export function listUsers() {
  return database()
    .prepare("SELECT id, email, name, role, password_hash, created_at FROM users ORDER BY created_at")
    .all()
    .map((item) => row<UserRow>(item));
}

export function findUserByEmail(email: string) {
  const found = database().prepare("SELECT id, email, name, role, password_hash, created_at FROM users WHERE email = ?").get(email.toLowerCase());
  return found ? row<UserRow>(found) : null;
}

export function findUserById(id: string) {
  const found = database().prepare("SELECT id, email, name, role, password_hash, created_at FROM users WHERE id = ?").get(id);
  return found ? row<UserRow>(found) : null;
}

export function insertUser(user: UserRow) {
  database()
    .prepare("INSERT INTO users (id, email, name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(user.id, user.email.toLowerCase(), user.name, user.password_hash, user.role, user.created_at);
}

export function updateUser(id: string, patch: { name?: string; role?: Role; password_hash?: string }) {
  const current = findUserById(id);
  if (!current) return;
  database()
    .prepare("UPDATE users SET name = ?, role = ?, password_hash = ? WHERE id = ?")
    .run(patch.name ?? current.name, patch.role ?? current.role, patch.password_hash ?? current.password_hash, id);
}

export function deleteUser(id: string) {
  database().prepare("DELETE FROM users WHERE id = ?").run(id);
}

export function createSession(tokenHash: string, userId: string, expiresAt: number) {
  database().prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)").run(tokenHash, userId, expiresAt);
}

export function deleteSession(tokenHash: string) {
  database().prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
}

export function userByToken(tokenHash: string) {
  const now = Date.now();
  const found = database()
    .prepare(
      `SELECT u.id, u.email, u.name, u.role, u.password_hash, u.created_at
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?`,
    )
    .get(tokenHash, now);
  return found ? row<UserRow>(found) : null;
}

export function getLedger(): Ledger | null {
  const raw = getMeta("ledger");
  if (!raw || raw === "null") return null;
  return JSON.parse(raw) as Ledger;
}

export function getRevision() {
  return Number(getMeta("revision") ?? "0");
}

export function listEvents(): ReviewEvent[] {
  return database()
    .prepare("SELECT payload FROM events ORDER BY at, id")
    .all()
    .map((item) => JSON.parse(String((item as { payload: string }).payload)) as ReviewEvent);
}

export function countEvents() {
  const found = database().prepare("SELECT COUNT(*) AS n FROM events").get() as { n?: number } | undefined;
  return Number(found?.n ?? 0);
}

export function replaceLedger(ledger: Ledger, events: ReviewEvent[] | null) {
  const db = database();
  db.exec("BEGIN");
  try {
    setMeta("ledger", JSON.stringify(ledger));
    if (events) {
      db.exec("DELETE FROM events");
      const insert = db.prepare("INSERT INTO events (id, day, at, payload) VALUES (?, ?, ?, ?)");
      for (const event of events) insert.run(event.id, event.day, event.at, JSON.stringify(event));
      setMeta("revision", String(events.length));
    } else if (!getMeta("revision")) {
      setMeta("revision", "0");
    }
    setMeta("imported_at", new Date().toISOString());
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function appendEvent(event: ReviewEvent, previousId: string | null, expectedRevision: number) {
  const db = database();
  db.exec("BEGIN");
  try {
    const revision = getRevision();
    const last = db.prepare("SELECT id FROM events ORDER BY at, id").all().at(-1) as { id?: string } | undefined;
    const lastId = last?.id ?? null;
    if (revision !== expectedRevision || lastId !== previousId) {
      db.exec("ROLLBACK");
      return { ok: false as const };
    }
    db.prepare("INSERT INTO events (id, day, at, payload) VALUES (?, ?, ?, ?)").run(event.id, event.day, event.at, JSON.stringify(event));
    setMeta("revision", String(revision + 1));
    db.exec("COMMIT");
    return { ok: true as const, revision: revision + 1 };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
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

export function listSheets(): StoredSheet[] {
  const raw = getMeta("sheets");
  return raw ? (JSON.parse(raw) as StoredSheet[]) : [];
}

export function saveSheets(sheets: StoredSheet[]) {
  setMeta("sheets", JSON.stringify(sheets));
}

export function syncIntervalMinutes() {
  return Number(getMeta("syncIntervalMinutes") || "5");
}

export function setSyncIntervalMinutes(minutes: number) {
  setMeta("syncIntervalMinutes", String(minutes));
}

export function getLedgerForDate(date: string): Ledger | null {
  const month = date.slice(0, 7);
  const raw = getMeta(`ledger:${month}`);
  if (raw && raw !== "null") return JSON.parse(raw) as Ledger;
  const current = getLedger();
  if (current?.as.slice(0, 7) === month) return current;
  return null;
}

export function saveMonthLedger(month: string, ledger: Ledger, primary = false) {
  setMeta(`ledger:${month}`, JSON.stringify(ledger));
  if (primary) setMeta("ledger", JSON.stringify(ledger));
}

export function replaceEventList(events: ReviewEvent[]) {
  const db = database();
  db.exec("BEGIN");
  try {
    db.exec("DELETE FROM events");
    const insert = db.prepare("INSERT INTO events (id, day, at, payload) VALUES (?, ?, ?, ?)");
    for (const event of events) insert.run(event.id, event.day, event.at, JSON.stringify(event));
    setMeta("revision", String(Number(getMeta("revision") || "0") + 1));
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export type SyncState = { at: string | null; ok: boolean; message: string; warningCount: number };

export function getSyncState(): SyncState {
  const raw = getMeta("lastSync");
  return raw ? (JSON.parse(raw) as SyncState) : { at: null, ok: true, message: "未同期", warningCount: 0 };
}

export function setSyncState(state: SyncState) {
  setMeta("lastSync", JSON.stringify(state));
}

export function getSheetAlerts(): { level: string; code: string; tab: string; project: string; message: string }[] {
  const raw = getMeta("sheetAlerts");
  return raw ? (JSON.parse(raw) as { level: string; code: string; tab: string; project: string; message: string }[]) : [];
}

export function setSheetAlerts(alerts: { level: string; code: string; tab: string; project: string; message: string }[]) {
  setMeta("sheetAlerts", JSON.stringify(alerts));
}
