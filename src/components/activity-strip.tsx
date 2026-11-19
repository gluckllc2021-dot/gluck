"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ActivityReport, Growth } from "@/lib/activity";
import { useLedger } from "./ledger-context";

export function useActivity() {
  const { date, region, project, revision } = useLedger();
  const [report, setReport] = useState<ActivityReport | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ date });
    if (region) query.set("region", region);
    if (project) query.set("project", project);
    fetch(`/api/activity?${query}`, { signal: controller.signal, cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => setReport(body))
      .catch(() => undefined);
    return () => controller.abort();
  }, [date, region, project, revision]);
  return report;
}

export function formatQty(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function GrowthMark({ growth, unit, compact = false }: { growth: Growth; unit: string; compact?: boolean }) {
  if (growth.diff == null) return <span className="text-neutral-500">前月の台帳なし</span>;
  const up = growth.diff > 0;
  const down = growth.diff < 0;
  const color = up ? "text-[#3dd68c]" : down ? "text-[#ff5c5c]" : "text-neutral-400";
  const arrow = up ? "▲" : down ? "▼" : "→";
  const rate = growth.rate == null ? "—" : `${growth.rate > 0 ? "+" : ""}${growth.rate}%`;
  const diff = `${growth.diff > 0 ? "+" : ""}${formatQty(growth.diff)}${unit}`;
  return (
    <span className={`font-bold ${color}`}>
      {arrow} {diff}{compact ? "" : `（${rate}）`}
    </span>
  );
}

export function ActivityStrip({ report }: { report: ActivityReport | null }) {
  const { link } = useLedger();
  if (!report) return <div className="panel px-3 py-3 text-sm text-neutral-500">月間の稼働を集計しています…</div>;
  const fair = report.partial;
  const peopleGrowth = fair ? report.momFair.people : report.momFull.people;
  const hoursGrowth = fair ? report.momFair.hours : report.momFull.hours;
  const compare = fair ? "前月同日まで" : "前月比";
  const cards = [
    ["今月の稼働人数", formatQty(report.month.people), "人", peopleGrowth, compare],
    ["今月の延べ人工", formatQty(report.month.hours), "人工", hoursGrowth, compare],
    ["年初来の稼働人数", formatQty(report.year.people), "人", null, report.year.label],
    ["年初来の延べ人工", formatQty(report.year.hours), "人工", null, report.year.label],
  ] as const;
  return (
    <Link href={link("/trend")} className="grid shrink-0 grid-cols-2 gap-2 lg:grid-cols-4">
      {cards.map(([label, value, unit, growth, hint]) => (
        <article key={label} className="panel px-3 py-2 transition hover:border-[#ff6a00]">
          <div className="text-[12px] text-neutral-400">{label}</div>
          <div className="mt-0.5 flex items-baseline gap-1">
            <span className="num text-[28px] leading-none text-[#ff6a00] lg:text-[32px]">{value}</span>
            <span className="text-xs text-neutral-400">{unit}</span>
          </div>
          <div className="mt-1 truncate text-[11px] text-neutral-400">
            {growth ? <><GrowthMark growth={growth} unit={unit} compact /> <span className="text-neutral-500">{hint}</span></> : hint}
          </div>
        </article>
      ))}
    </Link>
  );
}
