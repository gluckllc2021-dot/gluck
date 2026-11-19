"use client";

import { ActivityBars } from "./activity-bars";
import { ActivityStrip, GrowthMark, formatQty, useActivity } from "./activity-strip";
import type { ActivityBreakdown, Growth } from "@/lib/activity";
import { MobilePageHeader } from "./shell";

export function ActivityView() {
  const report = useActivity();
  return (
    <div className="mx-auto h-full max-w-6xl overflow-auto px-3 py-3 lg:px-6 lg:py-5">
      <MobilePageHeader title="稼働の推移" />
      <div className="mb-3 hidden items-end justify-between gap-3 lg:flex">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.16em] text-[#f2c300]">HEADCOUNT</p>
          <h1 className="text-2xl font-black">稼働の推移</h1>
        </div>
        <p className="max-w-xl text-sm text-neutral-400">1日以上出勤した人数と、延べ人工です。同じ人でも現場が違えば別に数え、会社一括はその期間でいちばん多かった日の人工を足します。</p>
      </div>
      <ActivityStrip report={report} />
      {!report && <p className="mt-4 text-sm text-neutral-500">集計しています…</p>}
      {report && (
        <div className="mt-4 space-y-4 pb-4">
          {report.partial && (
            <p className="rounded-lg border border-[#f2c300]/40 bg-[#1a1608] px-3 py-2 text-sm text-[#f2c300]">
              {report.month.label}の途中です。上の矢印は{report.previousSameDay?.label || "前月同日"}との比較です。前月全体とは別に下の表にも出しています。
            </p>
          )}
          {report.year.note && <p className="text-sm text-neutral-400">{report.year.note}</p>}
          <section className="panel p-3">
            <h2 className="mb-2 text-sm font-black">月ごとの稼働人数と延べ人工</h2>
            <div className="h-[280px]">
              <ActivityBars data={report.series} />
            </div>
          </section>
          <CompareCards reportPeople={report.month.people} reportHours={report.month.hours} full={report.momFull} fair={report.momFair} partial={report.partial} fullLabel={report.previousFull?.label || "前月全体"} fairLabel={report.previousSameDay?.label || "前月同日"} />
          <Breakdown title="地域別" rows={report.regions} partial={report.partial} />
          <Breakdown title="現場別" rows={report.sites} partial={report.partial} />
        </div>
      )}
    </div>
  );
}

function CompareCards({ reportPeople, reportHours, full, fair, partial, fullLabel, fairLabel }: {
  reportPeople: number;
  reportHours: number;
  full: { people: Growth; hours: Growth };
  fair: { people: Growth; hours: Growth };
  partial: boolean;
  fullLabel: string;
  fairLabel: string;
}) {
  const rows = partial
    ? [
        ["前月全体との比較", fullLabel, full],
        ["前月同日までの比較", fairLabel, fair],
      ] as const
    : [["前月との比較", fullLabel, full]] as const;
  return (
    <section className="grid gap-3 lg:grid-cols-2">
      {rows.map(([title, label, growth]) => (
        <article key={title} className="panel p-4">
          <h2 className="font-black">{title}</h2>
          <p className="mt-1 text-xs text-neutral-500">今月 {formatQty(reportPeople)}人 / {formatQty(reportHours)}人工　対 {label}</p>
          <p className="mt-2 text-sm">稼働人数 <GrowthMark growth={growth.people} unit="人" /></p>
          <p className="mt-1 text-sm">延べ人工 <GrowthMark growth={growth.hours} unit="人工" /></p>
        </article>
      ))}
    </section>
  );
}

function Breakdown({ title, rows, partial }: { title: string; rows: ActivityBreakdown[]; partial: boolean }) {
  return (
    <section className="panel overflow-hidden">
      <h2 className="px-3 py-2 text-sm font-black">{title}</h2>
      <div className="hidden overflow-auto lg:block">
        <table className="w-full text-left text-sm">
          <thead className="text-neutral-500">
            <tr>
              <th className="px-3 py-2 font-medium">名前</th>
              <th className="px-3 py-2 font-medium">稼働人数</th>
              <th className="px-3 py-2 font-medium">{partial ? "前月同日" : "前月比"}</th>
              {partial && <th className="px-3 py-2 font-medium">前月全体</th>}
              <th className="px-3 py-2 font-medium">延べ人工</th>
              <th className="px-3 py-2 font-medium">{partial ? "人工・前月同日" : "人工・前月比"}</th>
              {partial && <th className="px-3 py-2 font-medium">人工・前月全体</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-t border-[#262626]">
                <td className="px-3 py-2 font-bold">{row.key}{title === "現場別" && <span className="ml-2 text-xs font-normal text-neutral-500">{row.region}</span>}</td>
                <td className="px-3 py-2 text-[#ff6a00]">{formatQty(row.people)}</td>
                <td className="px-3 py-2"><GrowthMark growth={{ diff: row.fairPeople == null ? null : row.people - row.fairPeople, rate: rate(row.people, row.fairPeople) }} unit="人" compact /></td>
                {partial && <td className="px-3 py-2"><GrowthMark growth={{ diff: row.previousPeople == null ? null : row.people - row.previousPeople, rate: rate(row.people, row.previousPeople) }} unit="人" compact /></td>}
                <td className="px-3 py-2">{formatQty(row.hours)}</td>
                <td className="px-3 py-2"><GrowthMark growth={{ diff: row.fairHours == null ? null : round(row.hours - row.fairHours), rate: rate(row.hours, row.fairHours) }} unit="" compact /></td>
                {partial && <td className="px-3 py-2"><GrowthMark growth={{ diff: row.previousHours == null ? null : round(row.hours - row.previousHours), rate: rate(row.hours, row.previousHours) }} unit="" compact /></td>}
              </tr>
            ))}
            {!rows.length && <tr><td className="px-3 py-6 text-neutral-500" colSpan={7}>この条件の稼働はありません。</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="space-y-2 p-3 lg:hidden">
        {rows.map((row) => (
          <article key={row.key} className="rounded-lg border border-white/10 px-3 py-2">
            <div className="font-black">{row.key}</div>
            {title === "現場別" && <div className="text-xs text-neutral-500">{row.region}</div>}
            <p className="mt-1 text-sm">稼働 {formatQty(row.people)}人　<GrowthMark growth={{ diff: row.fairPeople == null ? null : row.people - row.fairPeople, rate: rate(row.people, row.fairPeople) }} unit="人" compact /></p>
            <p className="text-sm">延べ {formatQty(row.hours)}　<GrowthMark growth={{ diff: row.fairHours == null ? null : round(row.hours - row.fairHours), rate: rate(row.hours, row.fairHours) }} unit="" compact /></p>
            {partial && <p className="text-xs text-neutral-500">前月全体 {row.previousPeople ?? "—"}人 / {row.previousHours ?? "—"}人工</p>}
          </article>
        ))}
        {!rows.length && <p className="text-sm text-neutral-500">この条件の稼働はありません。</p>}
      </div>
    </section>
  );
}

function rate(current: number, previous: number | null) {
  if (previous == null) return null;
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
