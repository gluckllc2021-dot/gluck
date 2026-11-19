import { core, type Ledger, type ReviewEvent } from "./attendance";
import { headcount, peopleRollup, regionStats, siteStats, type Headcount, type RegionStat, type SiteStat } from "./aggregate";
import { shiftDate } from "./utils";

export type DayScope = { region?: string; projectName?: string };

export type DayFacts = {
  date: string;
  head: Headcount;
  sites: SiteStat[];
  regions: RegionStat[];
  doubles: ReturnType<typeof peopleRollup>;
  shortagePeople: number;
  shortageSites: number;
};

/** 未入力が6割以上、または出勤が一人もいない日は、まだ入力が揃っていないとみなす。 */
export function isSparse(head: Headcount) {
  if (!head.total) return true;
  return head.unknown / head.total >= 0.6 || head.attend === 0;
}

export function summarizeDay(ledger: Ledger, events: ReviewEvent[], date: string, scope: DayScope = {}): DayFacts {
  const snap = core(ledger, events, date);
  const index = scope.projectName ? ledger.p.findIndex((item) => String(item[0]) === scope.projectName) : -1;
  const project = scope.projectName ? (index >= 0 ? String(index) : "__none__") : undefined;
  const rows = snap.rows.filter((row) => {
    if (scope.region && String(ledger.p[row.pi]?.[1] ?? "") !== scope.region) return false;
    if (scope.projectName && String(ledger.p[row.pi]?.[0] ?? "") !== scope.projectName) return false;
    return true;
  });
  const sites = siteStats(ledger, snap.rows, snap.needs, { region: scope.region, project });
  const shortageSites = sites.filter((site) => (site.shortage ?? 0) > 0);
  return {
    date,
    head: headcount(rows),
    sites,
    regions: regionStats(sites),
    doubles: peopleRollup(rows).filter((person) => person.doubleAttend),
    shortagePeople: shortageSites.reduce((sum, site) => sum + (site.shortage ?? 0), 0),
    shortageSites: shortageSites.length,
  };
}

export function latestFilledDate(
  ledgers: { month: string; ledger: Ledger }[],
  events: ReviewEvent[],
  before: string,
  scope: DayScope = {},
  lookback = 45,
): string | null {
  const byMonth = new Map(ledgers.map((item) => [item.month, item.ledger]));
  for (let offset = 1; offset <= lookback; offset++) {
    const day = shiftDate(before, -offset);
    const ledger = byMonth.get(day.slice(0, 7));
    if (!ledger) continue;
    const facts = summarizeDay(ledger, events, day, scope);
    if (!isSparse(facts.head)) return day;
  }
  return null;
}
