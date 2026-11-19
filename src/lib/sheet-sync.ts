import crypto from "crypto";
import { mockNovemberWorkbook } from "./sheet-fixture";
import { ledgersFromWorkbook } from "./sheet-merge";
import { parseWorkbook, spreadsheetIdFromUrl, type SheetGrid, type TabMapping, type Workbook } from "./sheet-parse";
import {
  getLedgerForDate,
  getSheetAlerts,
  getSyncState,
  listEvents,
  listSheets,
  replaceEventList,
  saveMonthLedger,
  saveSheets,
  setSheetAlerts,
  setSyncState,
  syncIntervalMinutes,
  type StoredSheet,
} from "./db";

type ServiceAccount = { client_email: string; private_key: string };

let syncing = false;

export function accountConfigured() {
  return Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
}

export async function loadWorkbook(spreadsheetId: string): Promise<Workbook> {
  if (spreadsheetId.startsWith("mock-") || process.env.SHEET_SOURCE === "mock") return mockNovemberWorkbook();
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error("サービスアカウントの鍵が未設定です。環境変数 GOOGLE_SERVICE_ACCOUNT_JSON に、鍵ファイルの中身をそのまま入れてください。");
  }
  const account = JSON.parse(raw) as ServiceAccount;
  if (!account.client_email || !account.private_key) throw new Error("鍵ファイルに client_email と private_key がありません。");
  const token = await accessToken(account);
  const meta = await sheetsGet(token, `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=properties.title,sheets.properties.title`);
  const title = String(meta.properties?.title || "");
  const titles: string[] = (meta.sheets || []).map((sheet: { properties?: { title?: string } }) => sheet.properties?.title || "").filter(Boolean);
  const sheets: SheetGrid[] = [];
  for (const tab of titles) {
    const values = await sheetsGet(
      token,
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(tab)}?majorDimension=ROWS`,
    );
    sheets.push({ title: tab, rows: (values.values || []).map((row: unknown[]) => row.map((cell) => String(cell ?? ""))) });
  }
  return { spreadsheetId, title, sheets };
}

async function accessToken(account: ServiceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      iss: account.client_email,
      scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  const signature = signer.sign(account.private_key).toString("base64url");
  const assertion = `${header}.${payload}.${signature}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  const body = (await response.json()) as { access_token?: string; error_description?: string };
  if (!response.ok || !body.access_token) throw new Error(body.error_description || "Googleのログインに失敗しました。鍵と共有設定を確認してください。");
  return body.access_token;
}

async function sheetsGet(token: string, url: string) {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const body = (await response.json()) as { error?: { message?: string } };
  if (!response.ok) throw new Error(body.error?.message || "スプレッドシートを読めませんでした。閲覧権限で共有されているか確認してください。");
  return body as {
    properties?: { title?: string };
    sheets?: { properties?: { title?: string } }[];
    values?: unknown[][];
  };
}

function base64url(value: string) {
  return Buffer.from(value).toString("base64url");
}

export async function syncSheet(sheet: StoredSheet, asOf = today()) {
  const book = await loadWorkbook(sheet.spreadsheetId);
  const mappings = sheet.mappings as TabMapping[];
  const preview = parseWorkbook(book, mappings, asOf);
  const existing = new Map<string, NonNullable<ReturnType<typeof getLedgerForDate>>>();
  for (const month of [preview.month, ...preview.extraMonths.map((extra) => extra.month)]) {
    const ledger = getLedgerForDate(`${month}-15`);
    if (ledger) existing.set(month, ledger);
  }
  const applied = ledgersFromWorkbook(book, mappings, asOf, existing, listEvents());
  for (const [month, ledger] of applied.months) saveMonthLedger(month, ledger, month === asOf.slice(0, 7));
  replaceEventList(applied.events);
  const mergedMappings = mergeMappings(
    mappings,
    preview.projects.map((project) => ({
      tab: project.tab,
      projectName: project.projectName,
      region: project.region,
      include: project.include,
      discovered: project.discovered,
    })),
  );
  const warnings = applied.alerts.filter((alert) => alert.level === "alert");
  return { ...applied, mappings: mergedMappings, warningCount: warnings.length, title: book.title };
}

function mergeMappings(current: TabMapping[], found: TabMapping[]) {
  const map = new Map(current.map((item) => [item.tab, item]));
  for (const item of found) {
    if (!map.has(item.tab)) map.set(item.tab, item);
  }
  return [...map.values()];
}

function today() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export async function syncAll(force = false) {
  if (syncing) return getSyncState();
  const sheets = listSheets();
  if (!sheets.length) return getSyncState();
  const last = getSyncState();
  const interval = syncIntervalMinutes() * 60 * 1000;
  if (!force && last.at && Date.now() - new Date(last.at).getTime() < interval) return last;
  syncing = true;
  try {
    const alerts = [];
    let warningCount = 0;
    const next = [...sheets];
    for (const sheet of next) {
      try {
        const result = await syncSheet(sheet);
        sheet.title = result.title || sheet.title;
        sheet.mappings = result.mappings;
        sheet.lastSyncAt = new Date().toISOString();
        sheet.lastOk = true;
        sheet.lastWarningCount = result.warningCount;
        sheet.lastMessage = result.warningCount ? `要確認 ${result.warningCount}件` : "同期しました";
        warningCount += result.warningCount;
        alerts.push(...result.alerts);
      } catch (error) {
        sheet.lastSyncAt = new Date().toISOString();
        sheet.lastOk = false;
        sheet.lastMessage = error instanceof Error ? error.message : "同期に失敗しました";
      }
    }
    saveSheets(next);
    setSheetAlerts(alerts);
    const state = {
      at: new Date().toISOString(),
      ok: next.every((sheet) => sheet.lastOk),
      message: warningCount ? `要確認 ${warningCount}件` : "同期しました",
      warningCount,
    };
    setSyncState(state);
    return state;
  } finally {
    syncing = false;
  }
}

export function startSyncLoop() {
  const globalForSync = globalThis as unknown as { gluckSync?: NodeJS.Timeout };
  if (globalForSync.gluckSync) return;
  globalForSync.gluckSync = setInterval(() => {
    void syncAll(false);
  }, 60 * 1000);
  void syncAll(false);
}

export function publicSheets() {
  return {
    intervalMinutes: syncIntervalMinutes(),
    configured: accountConfigured() || process.env.SHEET_SOURCE === "mock" || listSheets().some((sheet) => sheet.spreadsheetId.startsWith("mock-")),
    sheets: listSheets(),
    alerts: getSheetAlerts(),
    sync: getSyncState(),
  };
}

export function addSheetFromUrl(url: string, month: string) {
  const spreadsheetId = spreadsheetIdFromUrl(url);
  if (!spreadsheetId) throw new Error("スプレッドシートのURLを貼り付けてください。");
  const sheets = listSheets();
  if (sheets.some((sheet) => sheet.spreadsheetId === spreadsheetId)) throw new Error("このシートは登録済みです。");
  sheets.push({
    id: crypto.randomUUID(),
    spreadsheetId,
    url: url.trim(),
    title: month ? `${month.replace("-", "年")}月　出面` : "",
    month: month || "",
    mappings: [],
    lastSyncAt: null,
    lastOk: false,
    lastMessage: "未同期",
    lastWarningCount: 0,
  });
  saveSheets(sheets);
  return sheets;
}
