import {
  companyOf,
  contactText,
  core,
  counted,
  isUnknown,
  missing,
  projectCode,
  projectManager,
  projectName,
  projectRegion,
  totalStats,
  type CoreRow,
  type Ledger,
  type ReviewEvent,
} from "./attendance";
import { norm, shiftDate } from "./utils";

export type Scope = {
  region?: string;
  project?: string;
  company?: string;
  q?: string;
  status?: string;
};

export type PersonStatus = "出勤" | "休み" | "欠勤" | "未入力" | "移動" | "その他";

export type PersonRollup = {
  key: string;
  name: string;
  rows: CoreRow[];
  status: PersonStatus;
  sites: number[];
  /** 同日に2現場以上で出勤が確定している */
  doubleAttend: boolean;
};

export type Headcount = {
  /** 重複を除いた実人数 */
  total: number;
  attend: number;
  rest: number;
  vacation: number;
  absent: number;
  unknown: number;
  move: number;
  other: number;
  rate: number | null;
  /** 数値で書かれた人工。時間表記（3時間・残業2）は人数のみで人工には足さない */
  manHours: number;
  /** 人数に数えない名簿行（名簿外・当日対象外を除く対象行） */
  rows: number;
  groups: number;
  groupHours: number;
  doubleAttend: number;
};

const EMPTY: Headcount = {
  total: 0,
  attend: 0,
  rest: 0,
  vacation: 0,
  absent: 0,
  unknown: 0,
  move: 0,
  other: 0,
  rate: null,
  manHours: 0,
  rows: 0,
  groups: 0,
  groupHours: 0,
  doubleAttend: 0,
};

export function personKey(name: string) {
  return name.normalize("NFKC").replace(/\s+/g, "");
}

export function classify(row: CoreRow) {
  const a = row.a;
  if (a.has === false || a.s === "名簿外") return "名簿外" as const;
  if (a.s === "当日対象外") return "当日対象外" as const;
  if (isUnknown(a)) return "未入力" as const;
  if (a.s === "出勤") return "出勤" as const;
  if (a.s === "休み" || a.s === "休暇") return "休み" as const;
  if (a.s === "欠勤") return "欠勤" as const;
  if (a.s === "移動") return "移動" as const;
  return "その他" as const;
}

function personStatus(list: CoreRow[]): PersonStatus {
  if (list.some((row) => counted(row, "出勤"))) return "出勤";
  if (list.some((row) => counted(row, "移動"))) return "移動";
  if (list.some((row) => counted(row, "欠勤"))) return "欠勤";
  if (list.some((row) => counted(row, "休み") || counted(row, "休暇"))) return "休み";
  if (list.some((row) => isUnknown(row.a) || row.a.c === "予定")) return "未入力";
  return "その他";
}

/** 会社一括（グループ人工）と名簿外は人数に入れない。同姓同名は1人。 */
export function peopleRollup(rows: CoreRow[]): PersonRollup[] {
  const map = new Map<string, CoreRow[]>();
  for (const row of rows) {
    if (row.a.group || (row.origin?.[3] && !row.a.known)) continue;
    if (row.a.has === false) continue;
    const key = personKey(row.n);
    if (!key) continue;
    const list = map.get(key);
    if (list) list.push(row);
    else map.set(key, [row]);
  }
  return [...map.entries()].map(([key, list]) => {
    const attendSites = [...new Set(list.filter((row) => counted(row, "出勤")).map((row) => row.pi))];
    return {
      key,
      name: list[0]?.n ?? key,
      rows: list,
      status: personStatus(list),
      sites: [...new Set(list.map((row) => row.pi))],
      doubleAttend: attendSites.length >= 2,
    };
  });
}

export function headcount(rows: CoreRow[]): Headcount {
  const h = { ...EMPTY };
  for (const person of peopleRollup(rows)) {
    h.total++;
    if (person.status === "出勤") h.attend++;
    else if (person.status === "休み") h.rest++;
    else if (person.status === "欠勤") h.absent++;
    else if (person.status === "未入力") h.unknown++;
    else if (person.status === "移動") h.move++;
    else h.other++;
    if (person.doubleAttend) h.doubleAttend++;
    if (person.status === "休み" && person.rows.some((row) => row.a.s === "休暇")) h.vacation++;
  }
  for (const row of rows) {
    if (row.a.group) {
      h.groups++;
      if (Number.isFinite(row.a.value)) h.groupHours += Number(row.a.value);
      continue;
    }
    if (row.a.has === false) continue;
    h.rows++;
    if (counted(row, "出勤") && Number.isFinite(row.a.value)) h.manHours += Number(row.a.value);
  }
  h.rate = h.total ? Math.round((h.attend / h.total) * 100) : null;
  return h;
}

export function matchStatus(row: CoreRow, status?: string) {
  if (!status || status === "すべて") return true;
  if (status === "未確認" || status === "未入力") return isUnknown(row.a);
  if (status === "休み") return row.a.s === "休み" || row.a.s === "休暇";
  return row.a.s === status;
}

export function rowText(ledger: Ledger, row: CoreRow) {
  return [row.n, companyOf(row), projectName(ledger, row.pi), projectRegion(ledger, row.pi), projectCode(ledger, row.pi), projectManager(ledger, row.pi)].join(" ");
}

export function inScope(ledger: Ledger, row: CoreRow, scope: Scope, withStatus = false) {
  if (scope.region && projectRegion(ledger, row.pi) !== scope.region) return false;
  if (scope.project !== undefined && scope.project !== "" && String(row.pi) !== scope.project) return false;
  if (scope.company && companyOf(row) !== scope.company) return false;
  if (scope.q && !norm(rowText(ledger, row)).includes(norm(scope.q))) return false;
  if (withStatus && !matchStatus(row, scope.status)) return false;
  return true;
}

export function projectInScope(ledger: Ledger, pi: number, scope: Scope) {
  if (scope.region && projectRegion(ledger, pi) !== scope.region) return false;
  if (scope.project !== undefined && scope.project !== "" && String(pi) !== scope.project) return false;
  return true;
}

export type SiteStat = {
  pi: number;
  name: string;
  region: string;
  code: string;
  manager: string;
  head: Headcount;
  required: number | null;
  requiredCertainty: string | null;
  shortage: number | null;
  reason: string | null;
  rate: number | null;
  rows: CoreRow[];
};

export function shortageReason(rows: CoreRow[], need?: ReviewEvent) {
  if (!need) return "必要人数が未登録";
  if (need.c !== "確定") return "必要人数が未確定";
  const stats = totalStats(rows);
  if (!rows.length) return "名簿がありません";
  if (stats.un) return "未確認の名簿があります";
  if (stats.group) return "会社一括の出勤があります";
  if (stats.dup) return "同名が複数あります";
  if (rows.some((r) => r.a.c === "予定")) return "予定の勤務が残っています";
  return null;
}

export function siteStats(ledger: Ledger, rows: CoreRow[], needs: Map<number, ReviewEvent>, scope: Scope): SiteStat[] {
  return ledger.p.map((_, pi) => {
    const siteRows = rows.filter((r) => r.pi === pi);
    const head = headcount(siteRows);
    const need = needs.get(pi);
    const shortage = missing(siteRows, needs, pi);
    return {
      pi,
      name: projectName(ledger, pi),
      region: projectRegion(ledger, pi),
      code: projectCode(ledger, pi),
      manager: projectManager(ledger, pi),
      head,
      required: need && Number.isFinite(need.value) ? Number(need.value) : null,
      requiredCertainty: need?.c ?? null,
      shortage,
      reason: shortage === null ? shortageReason(siteRows, need) : null,
      rate: head.rate,
      rows: siteRows,
    };
  }).filter((site) => projectInScope(ledger, site.pi, scope));
}

export type RegionStat = {
  region: string;
  attend: number;
  total: number;
  rate: number | null;
};

export function regionStats(sites: SiteStat[]): RegionStat[] {
  const map = new Map<string, RegionStat>();
  for (const site of sites) {
    const cur = map.get(site.region) ?? { region: site.region, attend: 0, total: 0, rate: null };
    cur.attend += site.head.attend;
    cur.total += site.head.total;
    map.set(site.region, cur);
  }
  return [...map.values()]
    .map((r) => ({ ...r, rate: r.total ? Math.round((r.attend / r.total) * 100) : null }))
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total);
}

export function companyStats(rows: CoreRow[]) {
  const map = new Map<string, CoreRow[]>();
  for (const row of rows) {
    const key = companyOf(row);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(row);
  }
  return [...map.entries()]
    .map(([company, list]) => ({ company, head: headcount(list), rows: list }))
    .sort((a, b) => b.head.total - a.head.total);
}

export function dailySeries(ledger: Ledger, events: ReviewEvent[], day: string, scope: Scope) {
  const out: { date: string; label: string; attend: number; unknown: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const date = shiftDate(day, -i);
    const snap = core(ledger, events, date);
    const rows = snap.rows.filter((r) => inScope(ledger, r, scope));
    const head = headcount(rows);
    const [, m, d] = date.split("-");
    const week = ["日", "月", "火", "水", "木", "金", "土"][new Date(Date.UTC(Number(date.slice(0, 4)), Number(m) - 1, Number(d))).getUTCDay()];
    out.push({
      date,
      label: `${Number(m)}/${Number(d)}(${week})`,
      attend: head.attend,
      unknown: head.unknown,
    });
  }
  return out;
}

export function rateDelta(ledger: Ledger, events: ReviewEvent[], day: string, scope: Scope) {
  const today = headcount(core(ledger, events, day).rows.filter((r) => inScope(ledger, r, scope)));
  const prev = headcount(core(ledger, events, shiftDate(day, -1)).rows.filter((r) => inScope(ledger, r, scope)));
  if (today.rate === null || prev.rate === null) return null;
  return today.rate - prev.rate;
}

export function scopedRows(ledger: Ledger, events: ReviewEvent[], day: string, scope: Scope, withStatus = false) {
  const snap = core(ledger, events, day);
  const rows = snap.rows.filter((r) => inScope(ledger, r, scope, withStatus));
  return { ...snap, rows, all: snap.rows };
}

export type QueueItem = {
  id: string;
  name: string;
  badge: string;
  project: string;
  detail: string;
  pi: number;
  key?: string;
};

export function queueItems(ledger: Ledger, rows: CoreRow[], day: string, scope: Scope): QueueItem[] {
  const items: QueueItem[] = [];
  for (const row of rows.filter((r) => inScope(ledger, r, scope))) {
    if (counted(row, "欠勤") || counted(row, "休み")) {
      items.push({
        id: row.key + "off",
        name: row.n,
        badge: row.a.s,
        project: projectName(ledger, row.pi),
        detail: row.notes.some((e) => e.t === "src") ? "台帳で確認" : "原本で確認",
        pi: row.pi,
        key: row.key,
      });
    }
    if (row.a.s === "休暇") {
      items.push({
        id: row.key + "leave",
        name: row.n,
        badge: "休暇",
        project: projectName(ledger, row.pi),
        detail: row.a.c,
        pi: row.pi,
        key: row.key,
      });
    }
    const flag = row.flag;
    if (flag && flag.flag !== "対応完了") {
      items.push({
        id: row.key + "flag",
        name: row.n,
        badge: flag.flag || "対応",
        project: projectName(ledger, row.pi),
        detail: flag.next || flag.memo || "次回対応未登録",
        pi: row.pi,
        key: row.key,
      });
    }
  }
  if (day >= ledger.as) {
    for (const person of ledger.people) {
      const pi = Number(person[0]);
      const name = String(person[1] ?? "");
      const status = String(person[2] ?? "");
      const start = String(person[3] ?? "");
      const end = String(person[4] ?? "");
      const doc = String(person[5] ?? "");
      const at = String(person[6] ?? "");
      if (pi < 0 || !projectInScope(ledger, pi, scope)) continue;
      if (scope.q && !norm(name).includes(norm(scope.q))) continue;
      const flags: string[] = [];
      if (/候補|予定|面談|書類待ち/.test(status)) flags.push("入場前");
      if (/未回収|未提出|一部待ち/.test(doc)) flags.push("書類未提出");
      if (end) flags.push("退場予定");
      if (!flags.length) continue;
      items.push({
        id: "pipe" + name + pi,
        name,
        badge: "現況は未確認",
        project: projectName(ledger, pi),
        detail: `${flags.join("・")} / 資料 ${status} / 書類 ${doc} / 報告 ${at} / 入場 ${start || "未確認"}`,
        pi,
      });
    }
  }
  return items;
}

export function statusLabel(site: SiteStat) {
  if (site.shortage === null) return { tone: "warn" as const, text: "要確認" };
  if (site.shortage > 0) return { tone: "short" as const, text: `要員不足（-${site.shortage}人）` };
  return { tone: "ok" as const, text: "—" };
}

export function describeCell(row: CoreRow) {
  return {
    source: contactText(row.source),
    ledger: contactText(row.a),
    detail: contactText(row.b),
  };
}

export const STATUS_OPTIONS = ["すべて", "出勤", "休み", "欠勤", "休暇", "チェックなし", "未入力", "未確認", "移動", "当日対象外", "名簿外"] as const;
