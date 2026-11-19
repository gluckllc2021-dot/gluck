import { core, counted, projectName, projectRegion, type Ledger, type ReviewEvent } from "./attendance";
import { personKey } from "./aggregate";

export type Growth = { diff: number | null; rate: number | null };

export type ActivitySlice = {
  people: number;
  hours: number;
  from: string;
  to: string;
  label: string;
};

export type ActivityBreakdown = {
  key: string;
  region: string;
  people: number;
  hours: number;
  previousPeople: number | null;
  previousHours: number | null;
  fairPeople: number | null;
  fairHours: number | null;
};

export type ActivityReport = {
  asOf: string;
  partial: boolean;
  monthLabel: string;
  month: ActivitySlice;
  previousFull: ActivitySlice | null;
  previousSameDay: ActivitySlice | null;
  momFull: { people: Growth; hours: Growth };
  momFair: { people: Growth; hours: Growth };
  year: ActivitySlice & { note: string };
  series: { month: string; label: string; people: number; hours: number; imported: boolean; partial: boolean }[];
  regions: ActivityBreakdown[];
  sites: ActivityBreakdown[];
};

type Scope = { region?: string; projectName?: string };

type Bucket = { people: Set<string>; hours: number; region: string };

export function growth(current: number, previous: number | null): Growth {
  if (previous == null) return { diff: null, rate: null };
  const diff = round(current - previous);
  if (previous === 0) return { diff, rate: current === 0 ? 0 : null };
  return { diff, rate: Math.round((diff / previous) * 1000) / 10 };
}

export function buildActivityReport(
  ledgers: { month: string; ledger: Ledger }[],
  events: ReviewEvent[],
  asOf: string,
  scope: Scope = {},
): ActivityReport {
  const byMonth = new Map(ledgers.map((item) => [item.month, item.ledger]));
  const month = asOf.slice(0, 7);
  const year = month.slice(0, 4);
  const day = Number(asOf.slice(-2));
  const dim = daysInMonth(month);
  const partial = day < dim;
  const monthStart = `${month}-01`;
  const monthTo = asOf < `${month}-${String(dim).padStart(2, "0")}` ? asOf : `${month}-${String(dim).padStart(2, "0")}`;
  const previous = shiftMonth(month, -1);
  const previousDim = daysInMonth(previous);
  const sameDay = Math.min(day, previousDim);
  const previousSameTo = `${previous}-${String(sameDay).padStart(2, "0")}`;
  const current = summarize(byMonth, events, monthStart, monthTo, scope);
  const fullPrevious = byMonth.has(previous) ? summarize(byMonth, events, `${previous}-01`, `${previous}-${String(previousDim).padStart(2, "0")}`, scope) : null;
  const fairPrevious = byMonth.has(previous) ? summarize(byMonth, events, `${previous}-01`, previousSameTo, scope) : null;
  const firstImported = [...byMonth.keys()].filter((item) => item.startsWith(year)).sort()[0];
  const yearFrom = firstImported ? `${firstImported}-01` : `${year}-01-01`;
  const yearSlice = summarize(byMonth, events, `${year}-01-01`, monthTo, scope);
  const series = [];
  for (let index = 1; index <= Number(month.slice(5)); index++) {
    const key = `${year}-${String(index).padStart(2, "0")}`;
    if (firstImported && key < firstImported) continue;
    const end = key === month ? monthTo : `${key}-${String(daysInMonth(key)).padStart(2, "0")}`;
    const slice = byMonth.has(key) ? summarize(byMonth, events, `${key}-01`, end, scope) : null;
    series.push({
      month: key,
      label: `${Number(key.slice(5))}月`,
      people: slice?.people.size ?? 0,
      hours: round(slice?.hours ?? 0),
      imported: byMonth.has(key),
      partial: key === month && partial,
    });
  }
  const regions = joinBreakdown(current.regions, fullPrevious?.regions ?? null, fairPrevious?.regions ?? null);
  const sites = joinBreakdown(current.sites, fullPrevious?.sites ?? null, fairPrevious?.sites ?? null);
  const monthNames = `${Number(month.slice(5))}月`;
  const previousName = `${Number(previous.slice(5))}月`;
  return {
    asOf,
    partial,
    monthLabel: monthNames,
    month: { people: current.people.size, hours: round(current.hours), from: monthStart, to: monthTo, label: `${monthNames}${day}日まで` },
    previousFull: fullPrevious
      ? { people: fullPrevious.people.size, hours: round(fullPrevious.hours), from: `${previous}-01`, to: `${previous}-${String(previousDim).padStart(2, "0")}`, label: `${previousName}全体` }
      : null,
    previousSameDay: fairPrevious
      ? { people: fairPrevious.people.size, hours: round(fairPrevious.hours), from: `${previous}-01`, to: previousSameTo, label: `${previousName}1〜${sameDay}日` }
      : null,
    momFull: { people: growth(current.people.size, fullPrevious ? fullPrevious.people.size : null), hours: growth(round(current.hours), fullPrevious ? round(fullPrevious.hours) : null) },
    momFair: { people: growth(current.people.size, fairPrevious ? fairPrevious.people.size : null), hours: growth(round(current.hours), fairPrevious ? round(fairPrevious.hours) : null) },
    year: {
      people: yearSlice.people.size,
      hours: round(yearSlice.hours),
      from: yearFrom,
      to: monthTo,
      label: `${year}年の取込済み`,
      note: firstImported && firstImported !== `${year}-01` ? `${Number(firstImported.slice(5))}月より前のシートは未登録です。累計は取込済みの月だけです。` : "",
    },
    series,
    regions,
    sites,
  };
}

function joinBreakdown(current: Map<string, Bucket>, previous: Map<string, Bucket> | null, fair: Map<string, Bucket> | null): ActivityBreakdown[] {
  const keys = new Set([...current.keys(), ...(previous?.keys() ?? []), ...(fair?.keys() ?? [])]);
  return [...keys].map((key) => {
    const now = current.get(key);
    const prev = previous?.get(key);
    const same = fair?.get(key);
    return {
      key,
      region: now?.region || prev?.region || same?.region || "",
      people: now?.people.size ?? 0,
      hours: round(now?.hours ?? 0),
      previousPeople: previous ? (prev?.people.size ?? 0) : null,
      previousHours: previous ? round(prev?.hours ?? 0) : null,
      fairPeople: fair ? (same?.people.size ?? 0) : null,
      fairHours: fair ? round(same?.hours ?? 0) : null,
    };
  }).sort((a, b) => b.people - a.people || a.key.localeCompare(b.key, "ja"));
}

function summarize(byMonth: Map<string, Ledger>, events: ReviewEvent[], from: string, to: string, scope: Scope) {
  const people = new Set<string>();
  let hours = 0;
  const regions = new Map<string, Bucket>();
  const sites = new Map<string, Bucket>();
  for (const iso of eachDay(from, to)) {
    const ledger = byMonth.get(iso.slice(0, 7));
    if (!ledger) continue;
    const snap = core(ledger, events, iso);
    for (const row of snap.rows) {
      if (!counted(row, "出勤")) continue;
      const region = projectRegion(ledger, row.pi) || "地域未確認";
      const site = projectName(ledger, row.pi);
      if (scope.region && region !== scope.region) continue;
      if (scope.projectName && site !== scope.projectName) continue;
      const value = Number.isFinite(row.a.value) ? Number(row.a.value) : 0;
      hours += value;
      const regionBucket = ensure(regions, region, region);
      const siteBucket = ensure(sites, site, region);
      regionBucket.hours += value;
      siteBucket.hours += value;
      if (row.a.group) continue;
      const key = personKey(row.n);
      if (!key) continue;
      people.add(key);
      regionBucket.people.add(key);
      siteBucket.people.add(key);
    }
  }
  return { people, hours, regions, sites };
}

function ensure(map: Map<string, Bucket>, key: string, region: string) {
  const found = map.get(key);
  if (found) return found;
  const created = { people: new Set<string>(), hours: 0, region };
  map.set(key, created);
  return created;
}

function eachDay(from: string, to: string) {
  const days: string[] = [];
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return days;
  for (let time = start; time <= end; time += 86400000) days.push(new Date(time).toISOString().slice(0, 10));
  return days;
}

function daysInMonth(ym: string) {
  const [year, month] = ym.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function shiftMonth(ym: string, delta: number) {
  const [year, month] = ym.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
