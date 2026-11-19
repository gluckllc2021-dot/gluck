"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, HardHat, MapPin } from "lucide-react";
import { core } from "@/lib/attendance";
import { headcount, peopleRollup, rateDelta, regionStats, siteStats, type SiteStat } from "@/lib/aggregate";
import type { ActivityReport, Growth } from "@/lib/activity";
import { formatLongDate, formatMobileDate, timeJST } from "@/lib/utils";
import { useLedger, type SheetAlert } from "./ledger-context";
import { ActivityBars } from "./activity-bars";
import { ActivityStrip, GrowthMark, formatQty, useActivity } from "./activity-strip";

export function HomeView() {
  const { ledger, events, date, region, project, moveDay, setDate, refreshedAt, link, loading, error, reload, sheetAlerts } = useLedger();
  const report = useActivity();
  const [wide, setWide] = useState<boolean | null>(null);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const apply = () => setWide(query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);
  const model = useMemo(() => {
    if (!ledger) return null;
    const snap = core(ledger, events, date);
    const scope = { region, project };
    const rows = snap.rows.filter((row) => (!region || String(ledger.p[row.pi]?.[1] ?? "") === region) && (project === "" || String(row.pi) === project));
    const head = headcount(rows);
    const sites = siteStats(ledger, snap.rows, snap.needs, scope);
    return {
      head,
      sites,
      regions: regionStats(sites),
      delta: rateDelta(ledger, events, date, scope),
      doubles: peopleRollup(rows).filter((person) => person.doubleAttend),
      notice: date.slice(0, 7) !== ledger.as.slice(0, 7) ? "この月の原本は未取込です。" : date > ledger.as ? "この日の原本はまだ照合していません。" : "",
    };
  }, [ledger, events, date, region, project]);

  if (loading && !model) return <div className="p-6 text-neutral-400">出面を集計しています…</div>;
  if (error && !model) return <div className="p-6"><button className="rounded bg-[#ff6a00] px-4 py-3 font-bold text-black" onClick={() => void reload()}>再読み込み</button><p className="mt-3">{error}</p></div>;
  if (!ledger || !model) return <div className="p-8 text-neutral-300">台帳がまだありません。設定から原本を取り込んでください。</div>;

  if (wide === null) return <div className="p-6 text-neutral-500">出面を集計しています…</div>;
  return wide ? (
    <PcHome date={date} model={model} report={report} alerts={sheetAlerts} moveDay={moveDay} setDate={setDate} refreshedAt={refreshedAt} link={link} />
  ) : (
    <MobileHome date={date} model={model} report={report} moveDay={moveDay} setDate={setDate} link={link} />
  );
}

type HomeModel = {
  head: ReturnType<typeof headcount>;
  sites: SiteStat[];
  regions: ReturnType<typeof regionStats>;
  delta: number | null;
  doubles: ReturnType<typeof peopleRollup>;
  notice: string;
};

function PcHome({ date, model, report, alerts, moveDay, setDate, refreshedAt, link }: {
  date: string;
  model: HomeModel;
  report: ActivityReport | null;
  alerts: SheetAlert[];
  moveDay: (n: number) => void;
  setDate: (d: string) => void;
  refreshedAt: Date | null;
  link: (path: string, extra?: Record<string, string | undefined>) => string;
}) {
  const { head, sites, regions, delta, doubles, notice } = model;
  const time = refreshedAt ? timeJST(refreshedAt) : "--:--";
  const shortPeople = sites.reduce((sum, site) => sum + (site.shortage ?? 0), 0);
  const shortSites = sites.filter((site) => (site.shortage ?? 0) > 0);
  const fair = report?.partial ?? false;
  const peopleGrowth = report ? (fair ? report.momFair.people : report.momFull.people) : null;
  const hoursGrowth = report ? (fair ? report.momFair.hours : report.momFull.hours) : null;
  const compare = fair ? "前月同日" : "前月比";
  const ranked = [...sites].sort((a, b) => (b.shortage ?? -1) - (a.shortage ?? -1) || b.head.attend - a.head.attend);
  const visibleSites = ranked.slice(0, 12);
  const concerns = [
    ...shortSites.slice(0, 3).map((site) => ({ href: link(`/sites/${site.pi}`), title: site.name, detail: `不足 ${site.shortage}人` })),
    ...doubles.slice(0, 2).map((person) => ({ href: link("/alerts"), title: person.name, detail: "同日2現場" })),
    ...alerts.filter((alert) => alert.level === "alert").slice(0, 3).map((alert) => ({ href: link("/alerts"), title: alert.project || "シート", detail: alert.message })),
  ].slice(0, 5);

  return (
    <div data-dashboard className="grid h-full min-h-0 grid-rows-[auto_auto_auto_minmax(0,1fr)] gap-2 overflow-hidden p-2">
      <div className="flex items-center gap-3">
        <HardHat className="h-5 w-5 text-[#ff6a00]" />
        <h1 className="text-lg font-black 2xl:text-xl">本日の出面</h1>
        {notice && <p className="truncate text-sm text-[#ffb067]">{notice}</p>}
        <div className="ml-auto flex items-center gap-1 text-sm text-neutral-300">
          <button className="grid h-8 w-8 place-items-center rounded hover:bg-white/5" onClick={() => moveDay(-1)} aria-label="前の日"><ChevronLeft /></button>
          <label className="relative font-bold">
            {formatLongDate(date)} {time} 時点
            <input className="absolute inset-0 cursor-pointer opacity-0" type="date" value={date} onChange={(event) => setDate(event.target.value)} aria-label="対象日" />
          </label>
          <button className="grid h-8 w-8 place-items-center rounded hover:bg-white/5" onClick={() => moveDay(1)} aria-label="次の日"><ChevronRight /></button>
        </div>
      </div>
      <section className="grid grid-cols-7 gap-2">
        <TodayCard href={link("/reports", { tab: "workers" })} label="全体人数" value={head.total} unit="人" caption={`名簿 ${head.rows}行`} />
        <TodayCard href={link("/reports", { tab: "workers", status: "出勤" })} label="出勤" value={head.attend} unit="人" hero caption={doubles.length ? `2現場 ${doubles.length}人` : "実人数"} />
        <TodayCard href={link("/reports", { tab: "workers", status: "休み" })} label="休み" value={head.rest} unit="人" caption={head.vacation ? `休暇 ${head.vacation}` : "休暇を含む"} />
        <TodayCard href={link("/reports", { tab: "workers", status: "欠勤" })} label="欠勤" value={head.absent} unit="人" tone="red" />
        <TodayCard href={link("/reports", { tab: "workers", status: "未入力" })} label="未入力" value={head.unknown} unit="人" />
        <TodayCard href={link("/alerts")} label="不足" value={shortPeople} unit="人" tone={shortPeople ? "orange" : undefined} caption={`${shortSites.length}現場`} />
        <Link href={link("/reports", { tab: "trend" })} className="panel flex items-center justify-between px-3 py-2 hover:border-[#ff6a00]">
          <div>
            <div className="text-[13px] font-bold text-neutral-400">出勤率</div>
            <div className="num text-[40px] leading-none text-[#ff6a00] 2xl:text-[52px]">{head.rate ?? 0}%</div>
            <div className={`text-xs font-bold ${delta !== null && delta < 0 ? "text-[#ff5c5c]" : "text-[#3dd68c]"}`}>前日比 {delta === null ? "—" : `${delta > 0 ? "+" : ""}${delta}%`}</div>
          </div>
          <Ring value={head.rate ?? 0} />
        </Link>
      </section>
      <section className="grid grid-cols-4 gap-2">
        <MonthCard href={link("/trend")} label="今月の稼働人数" value={report ? formatQty(report.month.people) : "—"} unit="人" growth={peopleGrowth} hint={compare} />
        <MonthCard href={link("/trend")} label="今月の延べ人工" value={report ? formatQty(report.month.hours) : "—"} unit="人工" growth={hoursGrowth} hint={compare} />
        <MonthCard href={link("/trend")} label="年初来の稼働人数" value={report ? formatQty(report.year.people) : "—"} unit="人" hint={report?.year.label || "取込済み"} />
        <MonthCard href={link("/trend")} label="年初来の延べ人工" value={report ? formatQty(report.year.hours) : "—"} unit="人工" hint={report?.year.note ? "未登録の月あり" : report?.year.label || ""} />
      </section>
      <section className="grid min-h-0 grid-cols-12 gap-2">
        <div className="col-span-3 flex min-h-0 flex-col gap-2">
          <article className="panel flex min-h-0 flex-1 flex-col overflow-hidden p-2">
            <h2 className="mb-1 flex items-center gap-1 text-sm font-black"><MapPin className="h-4 w-4 text-[#ff6a00]" />地域</h2>
            <div className="min-h-0 flex-1 space-y-1 overflow-hidden">
              {regions.map((item) => (
                <Link key={item.region} href={link("/sites", { region: item.region })} className="block rounded-md px-1 py-0.5 hover:bg-white/5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-bold">{item.region}</span>
                    <span className="num text-[22px] leading-none text-[#ff6a00]">{item.attend}<span className="text-xs text-neutral-500">/{item.total}</span></span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#2a2a2a]">
                    <div className="h-full bg-[#ff6a00]" style={{ width: `${item.rate ?? 0}%` }} />
                  </div>
                </Link>
              ))}
              {!regions.length && <p className="text-sm text-neutral-500">地域はありません。</p>}
            </div>
          </article>
          <article className="panel flex max-h-[48%] shrink-0 flex-col overflow-hidden p-2">
            <div className="mb-1 flex items-center justify-between">
              <h2 className="flex items-center gap-1 text-sm font-black"><AlertTriangle className="h-4 w-4 text-[#ff6a00]" />要確認</h2>
              <Link href={link("/alerts")} className="text-xs font-bold text-[#ffb067]">一覧</Link>
            </div>
            <div className="min-h-0 space-y-1 overflow-hidden">
              {concerns.map((item) => (
                <Link key={item.title + item.detail} href={item.href} className="block truncate rounded px-1 py-0.5 text-[13px] hover:bg-white/5">
                  <span className="font-bold text-[#ffb067]">{item.title}</span>
                  <span className="text-neutral-400">　{item.detail}</span>
                </Link>
              ))}
              {!concerns.length && <p className="text-sm font-bold text-[#3dd68c]">要確認はありません。</p>}
            </div>
          </article>
        </div>
        <div className="col-span-9 grid min-h-0 grid-rows-[minmax(0,1fr)_auto] gap-2">
          <Link href={link("/trend")} className="panel flex min-h-0 flex-col p-2 hover:border-[#ff6a00]">
            <h2 className="text-sm font-black">月別の稼働人数と延べ人工</h2>
            <div className="min-h-0 flex-1">{report ? <ActivityBars data={report.series} /> : <p className="p-4 text-sm text-neutral-500">集計しています…</p>}</div>
          </Link>
          <article className="panel overflow-hidden p-2">
            <div className="mb-1 flex items-center">
              <h2 className="text-sm font-black">現場</h2>
              <Link href={link("/sites")} className="ml-auto text-xs font-bold text-[#ffb067]">全{sites.length}現場</Link>
            </div>
            <div className="grid grid-cols-2 gap-x-3">
              {visibleSites.map((site) => (
                <Link key={site.pi} href={link(`/sites/${site.pi}`)} className="flex h-8 items-center gap-2 border-t border-[#262626] text-sm hover:bg-white/5">
                  <span className="w-16 shrink-0 truncate text-xs text-neutral-500">{site.region}</span>
                  <span className="min-w-0 flex-1 truncate font-bold">{site.name}</span>
                  <span className="num text-lg leading-none text-[#ff6a00]">{site.head.attend}</span>
                  <span className={`w-14 text-right text-xs font-bold ${site.shortage ? "text-[#ff8a33]" : "text-neutral-500"}`}>{site.shortage ? `-${site.shortage}` : "不足なし"}</span>
                </Link>
              ))}
            </div>
          </article>
        </div>
      </section>
    </div>
  );
}

function TodayCard({ href, label, value, unit, caption, hero, tone }: {
  href: string;
  label: string;
  value: number;
  unit: string;
  caption?: string;
  hero?: boolean;
  tone?: "orange" | "red";
}) {
  const color = tone === "red" ? "text-[#ff5c5c]" : tone === "orange" || hero ? "text-[#ff6a00]" : "text-white";
  return (
    <Link href={href} className="panel block px-3 py-2 hover:border-[#ff6a00]">
      <div className="text-[13px] font-bold text-neutral-400">{label}</div>
      <div className="flex items-baseline gap-1">
        <span className={`num leading-none ${color} ${hero ? "text-[48px] 2xl:text-[64px]" : "text-[40px] 2xl:text-[52px]"}`}>{value}</span>
        <span className="text-sm text-neutral-400">{unit}</span>
      </div>
      <div className="truncate text-[12px] text-neutral-500">{caption || "　"}</div>
    </Link>
  );
}

function MonthCard({ href, label, value, unit, growth, hint }: {
  href: string;
  label: string;
  value: string;
  unit: string;
  growth?: Growth | null;
  hint: string;
}) {
  return (
    <Link href={href} className="panel block px-3 py-2 hover:border-[#ff6a00]">
      <div className="text-[13px] font-bold text-neutral-400">{label}</div>
      <div className="flex items-baseline gap-1">
        <span className="num text-[32px] leading-none text-[#f2c300] 2xl:text-[40px]">{value}</span>
        <span className="text-xs text-neutral-400">{unit}</span>
      </div>
      <div className="truncate text-[12px]">
        {growth ? <GrowthMark growth={growth} unit={unit} /> : <span className="text-neutral-500">{hint}</span>}
        {growth && <span className="ml-1 text-neutral-500">{hint}</span>}
      </div>
    </Link>
  );
}

function Ring({ value }: { value: number }) {
  return (
    <svg viewBox="0 0 36 36" className="h-14 w-14 2xl:h-16 2xl:w-16">
      <circle cx="18" cy="18" r="14" fill="none" stroke="#2a2a2a" strokeWidth="3.5" />
      <circle cx="18" cy="18" r="14" fill="none" stroke="#ff6a00" strokeWidth="3.5" strokeLinecap="round" pathLength={100} strokeDasharray={`${value} ${100 - value}`} transform="rotate(-90 18 18)" />
    </svg>
  );
}

function MobileHome({ date, model, report, moveDay, setDate, link }: {
  date: string;
  model: HomeModel;
  report: ActivityReport | null;
  moveDay: (n: number) => void;
  setDate: (d: string) => void;
  link: (path: string, extra?: Record<string, string | undefined>) => string;
}) {
  const { head, sites } = model;
  const short = sites.filter((site) => (site.shortage ?? 0) > 0);
  const segments = [
    ["出勤", head.attend, "#ff6a00", "text-black"],
    ["休み", head.rest, "#5a5a5a", "text-white"],
    ["欠勤", head.absent, "#7a2a2a", "text-white"],
    ["未入力", head.unknown, "#242424", "text-[#ffb067]"],
  ] as const;
  return (
    <div className="lg:hidden">
      <header className="hazard">
        <div className="bg-black/45 px-4 py-4 text-center">
          <div className="flex items-center justify-center gap-2 text-[22px] font-black">
            <HardHat className="h-6 w-6 text-[#ff6a00]" />
            出面確認台帳
          </div>
          <p className="mt-1 text-xs text-neutral-200">安全・正確・リアルタイムな出面管理</p>
        </div>
      </header>
      <div className="space-y-3 px-3 py-3">
        <div className="flex h-14 items-center rounded-xl border border-white/10 bg-[#161616]">
          <button className="grid h-14 w-12 place-items-center" onClick={() => moveDay(-1)} aria-label="前の日"><ChevronLeft /></button>
          <label className="relative flex flex-1 items-center justify-center gap-2 text-lg font-black">
            <span>{formatMobileDate(date)}</span>
            <input className="absolute inset-0 opacity-0" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
          <button className="grid h-14 w-12 place-items-center" onClick={() => moveDay(1)} aria-label="次の日"><ChevronRight /></button>
        </div>
        <Link href={link("/reports", { tab: "workers", status: "出勤" })} className="flex items-end gap-2 px-1">
          <div className="pb-3 text-[28px] font-black leading-none tracking-widest text-[#ff6a00]" style={{ writingMode: "vertical-rl" }}>出勤</div>
          <div className="num text-[104px] leading-[0.82] text-[#ff6a00]">{head.attend}</div>
          <div className="pb-2 text-2xl font-bold text-neutral-300">/ {head.total}人</div>
        </Link>
        <div className="flex h-[68px] overflow-hidden rounded-lg">
          {segments.map(([label, count, bg, text]) => (
            <Link key={label} href={link("/reports", { tab: "workers", status: label })} className={`flex min-w-[72px] flex-1 flex-col items-center justify-center ${text}`} style={{ background: bg, flexGrow: Math.max(count, 1) }}>
              <span className="text-[13px] font-bold">{label}</span>
              <span className="num text-lg">{count}人</span>
            </Link>
          ))}
        </div>
        <ActivityStrip report={report} />
        <p className="text-xs text-neutral-500">実人数です。名簿 {head.rows}行{head.move ? `。移動 ${head.move}人は出勤に含めていません` : ""}{head.groups ? `。会社一括 ${head.groups}件` : ""}</p>
        <Link href={link("/alerts")} className="relative block overflow-hidden rounded-2xl border border-[#ff6a00]/50 bg-[#1c140d] p-4 pr-16">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-10 w-10 text-[#ff6a00]" />
            <div className="min-w-0 flex-1">
              <div className="text-[26px] font-black leading-tight">不足 {short.length}現場</div>
              <p className="text-sm leading-snug text-neutral-300">{short.length ? <>要員が足りていません。<br />確認してください。</> : "計算できた不足はありません。"}</p>
              {model.doubles.length > 0 && <p className="text-sm font-bold text-[#ffb067]">同日2現場出勤 {model.doubles.length}人</p>}
            </div>
            <ChevronRight />
          </div>
          <div className="hazard absolute inset-y-0 right-0 w-14 opacity-90" />
        </Link>
        <Link href={link("/trend")} className="block rounded-2xl border border-white/10 bg-[#171717] p-4 text-center text-base font-black text-[#f2c300]">月間・年間の推移を見る</Link>
        <div className="space-y-2.5">
          {sites.map((site) => {
            const base = site.required || site.head.total || 1;
            const width = Math.max(0, Math.min(100, Math.round((site.head.attend / base) * 100)));
            return (
              <Link key={site.pi} href={link(`/sites/${site.pi}`)} className="block rounded-2xl border border-white/10 bg-[#171717] p-4">
                <div className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-[#ff6a00]" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-lg font-black">{site.name}</div>
                    <div className="text-xs text-neutral-400">現場コード：{site.code}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-black">{site.head.attend} / {site.required ?? site.head.total}人</div>
                    <ChevronRight className="ml-auto h-4 w-4 text-neutral-500" />
                  </div>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#2a2a2a]">
                  <div className="h-full rounded-full bg-[#ff6a00]" style={{ width: `${width}%` }} />
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
