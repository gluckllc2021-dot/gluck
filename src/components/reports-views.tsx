"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { core, projectName } from "@/lib/attendance";
import { companyStats, headcount, peopleRollup, queueItems, siteStats } from "@/lib/aggregate";
import { useLedger } from "./ledger-context";
import { MobilePageHeader } from "./shell";
import { AdminHero, brandEn } from "./brand";
import { TrendChart } from "./trend-chart";
import { dailySeries } from "@/lib/aggregate";

export function AlertsView() {
  const { ledger, events, date, region, project, link, sheetAlerts } = useLedger();
  const model = useMemo(() => {
    if (!ledger) return null;
    const snap = core(ledger, events, date);
    const scope = { region, project };
    const sites = siteStats(ledger, snap.rows, snap.needs, scope);
    const rows = snap.rows.filter((row) => scope.region ? String(ledger.p[row.pi]?.[1] ?? "") === scope.region : true).filter((row) => !scope.project || String(row.pi) === scope.project);
    return {
      short: sites.filter((site) => (site.shortage ?? 0) > 0),
      unknown: peopleRollup(rows).filter((person) => person.status === "未入力"),
      doubled: peopleRollup(rows).filter((person) => person.doubleAttend),
      queue: queueItems(ledger, rows, date, scope),
    };
  }, [ledger, events, date, region, project]);
  if (!ledger || !model) return null;
  return (
    <div className="mx-auto max-w-5xl px-3 py-3 lg:px-6">
      <MobilePageHeader title="アラート" />
      <h1 className="mb-4 hidden text-2xl font-black lg:block">未確認・不足・2現場出勤</h1>
      {sheetAlerts.filter((alert) => alert.level === "alert").length > 0 && (
        <Section title="シートの記入ミス">
          {sheetAlerts.filter((alert) => alert.level === "alert").map((alert, index) => (
            <div key={index} className="panel px-4 py-3 text-sm">{alert.message}</div>
          ))}
        </Section>
      )}
      <Section title={`要員不足 ${model.short.length}現場`}>
        {model.short.map((site) => (
          <Link key={site.pi} href={link(`/sites/${site.pi}`)} className="panel flex items-center justify-between px-4 py-3">
            <div>
              <div className="font-black">{site.name}</div>
              <div className="text-sm text-neutral-400">{site.region}　必要 {site.required}人　出勤 {site.head.attend}人</div>
            </div>
            <div className="font-black text-[#ff8a33]">-{site.shortage}人</div>
          </Link>
        ))}
        {!model.short.length && <Empty text="計算できた不足はありません。" />}
      </Section>
      <Section title={`同日2現場出勤 ${model.doubled.length}人`}>
        {model.doubled.map((person) => (
          <div key={person.key} className="panel px-4 py-3">
            <div className="font-black">{person.name}</div>
            <div className="text-sm text-[#ffb067]">{person.sites.map((pi) => projectName(ledger, pi)).join("　／　")}</div>
          </div>
        ))}
        {!model.doubled.length && <Empty text="同じ日に2現場で出勤になっている人はいません。" />}
      </Section>
      <Section title={`未入力 ${model.unknown.length}人`}>
        {model.unknown.slice(0, 30).map((person) => (
          <div key={person.key} className="panel px-4 py-3">
            <div className="font-black">{person.name}</div>
            <div className="text-sm text-neutral-400">{person.sites.map((pi) => projectName(ledger, pi)).join("・")}</div>
          </div>
        ))}
        {!model.unknown.length && <Empty text="未入力の人はいません。" />}
      </Section>
      <Section title={`対応待ち ${model.queue.length}件`}>
        {model.queue.map((item) => (
          <div key={item.id} className="panel px-4 py-3">
            <div className="flex justify-between gap-2"><span className="font-black">{item.name}</span><span className="text-sm text-[#ffb067]">{item.badge}</span></div>
            <div className="text-sm text-neutral-400">{item.project}　{item.detail}</div>
          </div>
        ))}
        {!model.queue.length && <Empty text="対応待ちはありません。" />}
      </Section>
    </div>
  );
}

export function ReportsView() {
  const { ledger, events, date, region, project, link } = useLedger();
  const tab = useSearchParams().get("tab") || "trend";
  const status = useSearchParams().get("status") || "すべて";
  const [localStatus, setLocalStatus] = useState(status);
  const model = useMemo(() => {
    if (!ledger) return null;
    const scope = { region, project, status: localStatus };
    const snap = core(ledger, events, date);
    const rows = snap.rows.filter((row) => (!region || String(ledger.p[row.pi]?.[1] ?? "") === region) && (!project || String(row.pi) === project));
    return { series: dailySeries(ledger, events, date, scope), companies: companyStats(rows), head: headcount(rows), events: [...events].reverse().filter((event) => event.day.slice(0, 7) === date.slice(0, 7)) };
  }, [ledger, events, date, region, project, localStatus]);
  if (!ledger || !model) return null;
  const tabs = [
    ["trend", "日別推移"],
    ["company", "会社別"],
    ["workers", "作業員"],
    ["diff", "差分"],
    ["history", "変更履歴"],
  ] as const;
  const rows = core(ledger, events, date).rows.filter((row) => (!region || String(ledger.p[row.pi]?.[1] ?? "") === region) && (!project || String(row.pi) === project));
  return (
    <div className="mx-auto h-full max-w-6xl overflow-auto px-3 py-3 lg:px-6">
      {tab !== "history" && <MobilePageHeader title="実績・レポート" />}
      <div className="mb-3 flex flex-wrap gap-2">
        {tabs.map(([id, label]) => (
          <Link id={`report-tab-${id}`} key={id} href={link("/reports", { tab: id })} className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold ${tab === id ? "bg-[#ff6a00] text-black" : "bg-[#1c1c1c] text-neutral-300"}`}>{label}</Link>
        ))}
        <a className="shrink-0 rounded-full bg-[#1c1c1c] px-4 py-2 text-sm font-bold text-[#ffb067]" href={link("/api/export", { kind: "workers", status: localStatus === "すべて" ? undefined : localStatus })}>作業員CSV</a>
        <Link className="shrink-0 rounded-full bg-[#1c1c1c] px-4 py-2 text-sm font-bold" href={link("/print")}>印刷</Link>
      </div>
      {tab === "trend" && (
        <div className="panel h-[360px] p-3">
          <h2 className="font-black">日別の出勤実人数</h2>
          <TrendChart data={model.series} />
        </div>
      )}
      {tab === "company" && (
        <div className="panel overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-neutral-400"><tr>{["所属", "実人数", "出勤", "休み", "欠勤", "未入力", "移動"].map((label) => <th key={label} className="px-3 py-2">{label}</th>)}</tr></thead>
            <tbody>
              {model.companies.map((company) => (
                <tr key={company.company} className="border-t border-[#262626]">
                  <td className="px-3 py-2 font-bold">{company.company}</td>
                  <td className="px-3 py-2">{company.head.total}</td>
                  <td className="px-3 py-2 text-[#ff6a00]">{company.head.attend}</td>
                  <td className="px-3 py-2">{company.head.rest}</td>
                  <td className="px-3 py-2">{company.head.absent}</td>
                  <td className="px-3 py-2">{company.head.unknown}</td>
                  <td className="px-3 py-2">{company.head.move}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {tab === "workers" && (
        <div>
          <select className="field mb-3 max-w-xs" value={localStatus} onChange={(event) => setLocalStatus(event.target.value)}>
            {["すべて", "出勤", "休み", "欠勤", "未入力", "移動"].map((item) => <option key={item}>{item}</option>)}
          </select>
          <div className="space-y-2">
            {peopleRollup(rows).filter((person) => localStatus === "すべて" || person.status === localStatus).map((person) => (
              <div key={person.key} className="panel flex items-center justify-between px-4 py-3">
                <div>
                  <div className="font-black">{person.name} {person.doubleAttend && <span className="text-xs text-[#ffb067]">2現場</span>}</div>
                  <div className="text-sm text-neutral-400">{person.sites.map((pi) => projectName(ledger, pi)).join("・")}</div>
                </div>
                <div className="font-bold text-[#ff8a33]">{person.status}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {tab === "diff" && (
        <div className="space-y-2">
          {rows.filter((row) => row.delta.length).map((row) => (
            <div key={row.key} className="panel px-4 py-3">
              <div className="font-black">{row.n}　<span className="text-[#ffb067]">{row.delta.join("・")}</span></div>
              <div className="text-sm text-neutral-400">{projectName(ledger, row.pi)}　原本 {row.source.s}　台帳 {row.a.s}　案件詳細 {row.b.s}</div>
            </div>
          ))}
          {!rows.some((row) => row.delta.length) && <Empty text="差分はありません。" />}
        </div>
      )}
      {tab === "history" && (
        <div className={`${brandEn.variable} space-y-3`}>
          <AdminHero kicker="HISTORY" title="訂正履歴" lead="原本の値は残したまま、台帳側の訂正だけを時系列で残します。シート同期では上書きしません。" />
          {model.events.filter((event) => !project || String(event.pi) === project).map((event) => (
            <article key={event.id} className="brand-card px-4 py-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-[11px] font-bold text-[#f2c300]">{event.t === "need" ? "必要人数" : event.t === "note" ? "確認メモ" : "出面の訂正"}</p>
                  <h3 className="mt-1 font-black">{event.n || projectName(ledger, event.pi)}</h3>
                </div>
                <span className={`${brandEn.className} text-sm font-semibold text-[#f2c300]`}>{event.day}</span>
              </div>
              <p className="mt-2 text-sm text-white/80">{event.before?.label || "記録なし"} <span className="text-[#ff6a00]">→</span> {event.after?.label || event.s || event.flag || ""}</p>
              <p className="mt-1 text-sm text-white/50">{projectName(ledger, event.pi)}　{event.who}　{event.ref}</p>
            </article>
          ))}
          {!model.events.length && <Empty text="この月の訂正履歴はまだありません。" />}
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-lg font-black">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}
function Empty({ text }: { text: string }) {
  return <p className="rounded-lg border border-dashed border-[#333] px-4 py-6 text-sm text-neutral-500">{text}</p>;
}
