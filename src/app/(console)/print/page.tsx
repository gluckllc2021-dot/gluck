"use client";

import { useMemo } from "react";
import { core, projectName } from "@/lib/attendance";
import { headcount, siteStats, statusLabel } from "@/lib/aggregate";
import { formatLongDate } from "@/lib/utils";
import { useLedger } from "@/components/ledger-context";

export default function PrintPage() {
  const { ledger, events, date, region, project } = useLedger();
  const model = useMemo(() => {
    if (!ledger) return null;
    const snap = core(ledger, events, date);
    const sites = siteStats(ledger, snap.rows, snap.needs, { region, project });
    const rows = snap.rows.filter((row) => (!region || String(ledger.p[row.pi]?.[1] ?? "") === region) && (!project || String(row.pi) === project));
    return { sites, head: headcount(rows) };
  }, [ledger, events, date, region, project]);
  if (!ledger || !model) return null;
  return (
    <main className="bg-white px-6 py-6 text-black print:px-0">
      <div className="no-print mb-4">
        <button className="rounded bg-black px-4 py-2 font-bold text-white" onClick={() => window.print()}>印刷する</button>
      </div>
      <h1 className="text-2xl font-black">出面確認台帳　{formatLongDate(date)}</h1>
      <p className="text-sm">グリュック合同会社　全体 {model.head.total}　出勤 {model.head.attend}　出勤率 {model.head.rate ?? 0}%　名簿 {model.head.rows}行</p>
      <table className="mt-4 w-full border-collapse text-sm">
        <thead>
          <tr>{["現場", "地域", "全体", "出勤", "休み", "欠勤", "未入力", "出勤率", "状態"].map((label) => <th key={label} className="border px-2 py-1 text-left">{label}</th>)}</tr>
        </thead>
        <tbody>
          {model.sites.map((site) => (
            <tr key={site.pi}>
              <td className="border px-2 py-1">{site.name}</td>
              <td className="border px-2 py-1">{site.region}</td>
              <td className="border px-2 py-1">{site.head.total}</td>
              <td className="border px-2 py-1">{site.head.attend}</td>
              <td className="border px-2 py-1">{site.head.rest}</td>
              <td className="border px-2 py-1">{site.head.absent}</td>
              <td className="border px-2 py-1">{site.head.unknown}</td>
              <td className="border px-2 py-1">{site.head.rate ?? 0}%</td>
              <td className="border px-2 py-1">{statusLabel(site).text}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-6 text-xs text-neutral-600">会社一括の人工は人数に含めていません。時間表記の出勤は人数に含め、数値人工には足していません。</p>
      <p className="hidden">{projectName(ledger, 0)}</p>
    </main>
  );
}
