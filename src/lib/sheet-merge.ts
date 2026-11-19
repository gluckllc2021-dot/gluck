import type { Ledger, ReviewEvent } from "./attendance";
import { core } from "./attendance";
import {
  parseWorkbook,
  type ParsedWorker,
  type ParseResult,
  type SheetAlert,
  type Workbook,
} from "./sheet-parse";

export type MonthBundle = { ledger: Ledger; alerts: SheetAlert[] };

function daysInMonth(ym: string) {
  const [year, month] = ym.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function personKey(name: string) {
  return name.normalize("NFKC").replace(/\s+/g, "");
}

function symbolChar(table: string[], raw: string) {
  const text = raw === "1.0" ? "1" : raw.replace(/２/g, "2");
  let index = table.indexOf(text);
  if (index < 0) {
    table.push(text);
    index = table.length - 1;
  }
  return String.fromCharCode(65 + index);
}

function encodeWorker(worker: ParsedWorker, month: string, pi: number, cap: number, table: string[]) {
  const dim = daysInMonth(month);
  let marks = "";
  let mask = "";
  for (let day = 1; day <= dim; day++) {
    const iso = `${month}-${String(day).padStart(2, "0")}`;
    const mark = worker.days[iso];
    if (day > cap || !mark) {
      marks += "A";
      mask += day > cap ? "0" : "1";
      continue;
    }
    mask += "1";
    if (mark.status === "blank") marks += "A";
    else if (mark.status === "move") marks += symbolChar(table, "移動");
    else if (mark.status === "rest") marks += symbolChar(table, "休み");
    else if (mark.status === "absent") marks += symbolChar(table, "欠勤");
    else if (mark.value != null) marks += symbolChar(table, String(mark.value === 1 ? 1 : mark.value));
    else marks += symbolChar(table, mark.raw || "1");
  }
  return [pi, worker.name, "", worker.group ? 1 : 0, marks, "", mask, ""];
}

export function ledgersFromWorkbook(book: Workbook, mappings: import("./sheet-parse").TabMapping[], asOf: string, existing = new Map<string, Ledger>(), events: ReviewEvent[] = []) {
  const parsed = parseWorkbook(book, mappings, asOf);
  const buckets = new Map<string, { name: string; region: string; cap: number; workers: ParsedWorker[] }[]>();
  const add = (month: string, name: string, region: string, cap: number, workers: ParsedWorker[]) => {
    if (!buckets.has(month)) buckets.set(month, []);
    buckets.get(month)!.push({ name, region, cap, workers });
  };
  for (const project of parsed.projects) {
    if (!project.include) continue;
    add(parsed.month, project.projectName, project.region, project.dayCap, project.workers);
  }
  for (const extra of parsed.extraMonths) {
    add(extra.month, extra.project.projectName, extra.project.region, extra.project.dayCap, extra.workers);
  }
  const months = new Map<string, Ledger>();
  const nextEvents = events.map((event) => ({ ...event }));
  for (const [month, projects] of buckets) {
    const built = buildMonth(month, projects, existing.get(month) || null, nextEvents, asOf);
    months.set(month, built);
  }
  const diffs = diffRows(months.get(asOf.slice(0, 7)) || null, nextEvents, asOf);
  return { months, events: nextEvents, alerts: parsed.alerts, diffs };
}

function buildMonth(
  month: string,
  projects: { name: string; region: string; cap: number; workers: ParsedWorker[] }[],
  existing: Ledger | null,
  events: ReviewEvent[],
  asOf: string,
) {
  const oldProjects = existing?.p ?? [];
  const projectsOut: unknown[][] = oldProjects.map((project) => [...project]);
  const nameToPi = new Map(projectsOut.map((project, index) => [String(project[0]), index]));
  for (const project of projects) {
    if (!nameToPi.has(project.name)) {
      nameToPi.set(project.name, projectsOut.length);
      projectsOut.push([project.name, project.region, "", "", project.cap]);
    } else {
      const index = nameToPi.get(project.name)!;
      projectsOut[index][1] = project.region;
      projectsOut[index][4] = project.cap;
    }
  }
  const table = ["", "1", "移動", "残業2", "3時間", "2時間", "3", "2"];
  const oldRows = existing?.r ?? [];
  const oldKey = new Map<string, number>();
  oldRows.forEach((row, index) => {
    const projectName = String(oldProjects[Number(row[0])]?.[0] ?? "");
    oldKey.set(`${projectName}|${personKey(String(row[1] ?? ""))}`, index);
  });
  const kept = new Set<number>();
  const fresh: { at: number | null; row: unknown[] }[] = [];
  for (const project of projects) {
    const pi = nameToPi.get(project.name)!;
    for (const worker of project.workers) {
      const key = `${project.name}|${personKey(worker.name)}`;
      const previous = oldKey.get(key);
      const encoded = encodeWorker(worker, month, pi, project.cap, table);
      if (previous !== undefined) {
        kept.add(previous);
        fresh.push({ at: previous, row: encoded });
      } else fresh.push({ at: null, row: encoded });
    }
  }
  const rows: unknown[][] = [];
  const indexMap = new Map<number, number>();
  oldRows.forEach((row, index) => {
    const projectName = String(oldProjects[Number(row[0])]?.[0] ?? "");
    const still = projects.some((project) => project.name === projectName);
    const referenced = events.some((event) => event.day.slice(0, 7) === month && event.key === `b${index}`);
    if (kept.has(index) || (still && referenced) || !still) {
      if (!still || kept.has(index) || referenced) {
        indexMap.set(index, rows.length);
        const updated = fresh.find((item) => item.at === index);
        rows.push(updated ? updated.row : row);
      }
    }
  });
  for (const item of fresh) {
    if (item.at !== null) continue;
    rows.push(item.row);
  }
  for (const event of events) {
    if (event.day.slice(0, 7) !== month) continue;
    const matched = /^b(\d+)$/.exec(event.key || "");
    if (!matched) continue;
    const next = indexMap.get(Number(matched[1]));
    if (next === undefined) continue;
    const oldName = String(oldProjects[event.pi]?.[0] ?? "");
    event.key = `b${next}`;
    if (oldName && nameToPi.has(oldName)) event.pi = nameToPi.get(oldName)!;
  }
  const as = asOf.slice(0, 7) === month ? asOf : `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;
  const ledger: Ledger = {
    v: 1,
    as,
    ds: as,
    r: rows,
    val: table,
    p: projectsOut,
    people: existing?.people ?? [],
    plan: existing?.plan ?? [],
    hist: existing?.hist ?? [],
    meta: { ...(existing?.meta || {}), sheet: { title: month } },
  };
  return ledger;
}

function diffRows(ledger: Ledger | null, events: ReviewEvent[], day: string) {
  if (!ledger) return [];
  const snap = core(ledger, events, day);
  return snap.rows
    .filter((row) => row.delta.includes("原本と台帳の訂正差"))
    .map((row) => ({ name: row.n, project: String(ledger.p[row.pi]?.[0] ?? ""), day }));
}

export function collectDoubleNames(result: ParseResult) {
  return result.alerts.filter((alert) => alert.code === "double");
}
