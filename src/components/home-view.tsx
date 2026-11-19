"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, CircleHelp, Download, HardHat, LineChart, MapPin, Minus, X } from "lucide-react";
import { core, projectName } from "@/lib/attendance";
import { dailySeries, headcount, peopleRollup, rateDelta, regionStats, siteStats, statusLabel, type SiteStat } from "@/lib/aggregate";
import { formatLongDate, formatMobileDate, timeJST } from "@/lib/utils";
import { useLedger } from "./ledger-context";
import { JapanMap } from "./japan-map";
import { TrendChart } from "./trend-chart";

export function HomeView() {
  const { ledger, events, date, region, project, moveDay, setDate, refreshedAt, link, loading, error, reload } = useLedger();
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
      series: dailySeries(ledger, events, date, scope),
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
    <PcHome date={date} model={model} moveDay={moveDay} setDate={setDate} refreshedAt={refreshedAt} link={link} ledgerNames={(pi) => projectName(ledger, pi)} />
  ) : (
    <MobileHome date={date} model={model} moveDay={moveDay} setDate={setDate} link={link} />
  );
}

function Ring({ value }: { value: number }) {
  return (
    <svg viewBox="0 0 36 36" className="h-[72px] w-[72px]">
      <circle cx="18" cy="18" r="14" fill="none" stroke="#2a2a2a" strokeWidth="3.5" />
      <circle cx="18" cy="18" r="14" fill="none" stroke="#ff6a00" strokeWidth="3.5" strokeLinecap="round" pathLength={100} strokeDasharray={`${value} ${100 - value}`} transform="rotate(-90 18 18)" />
    </svg>
  );
}

type HomeModel = {
  head: ReturnType<typeof headcount>;
  sites: SiteStat[];
  regions: ReturnType<typeof regionStats>;
  series: ReturnType<typeof dailySeries>;
  delta: number | null;
  doubles: ReturnType<typeof peopleRollup>;
  notice: string;
};

function PcHome({ date, model, moveDay, setDate, refreshedAt, link, ledgerNames }: {
  date: string;
  model: HomeModel;
  moveDay: (n: number) => void;
  setDate: (d: string) => void;
  refreshedAt: Date | null;
  link: (path: string, extra?: Record<string, string | undefined>) => string;
  ledgerNames: (pi: number) => string;
}) {
  const { head, sites, regions, series, delta, doubles, notice } = model;
  const time = refreshedAt ? timeJST(refreshedAt) : "--:--";
  return (
    <div className="hidden h-full min-h-0 flex-col gap-3 px-4 py-3 lg:flex">
      <div className="flex shrink-0 items-center gap-3">
        <HardHat className="h-5 w-5 text-[#ff6a00]" />
        <h1 className="text-lg font-black">本日の出面サマリー</h1>
        <div className="ml-auto flex items-center gap-1 text-sm text-neutral-300">
          <button className="grid h-9 w-9 place-items-center rounded hover:bg-white/5" onClick={() => moveDay(-1)} aria-label="前の日"><ChevronLeft /></button>
          <label className="relative font-medium">
            {formatLongDate(date)} {time} 時点
            <input className="absolute inset-0 cursor-pointer opacity-0" type="date" value={date} onChange={(event) => setDate(event.target.value)} aria-label="対象日" />
          </label>
          <button className="grid h-9 w-9 place-items-center rounded hover:bg-white/5" onClick={() => moveDay(1)} aria-label="次の日"><ChevronRight /></button>
        </div>
      </div>
      {notice && <p className="shrink-0 text-sm text-[#ffb067]">{notice}</p>}
      <section className="grid shrink-0 grid-cols-6 gap-2">
        <Kpi label="全体人数" value={head.total} unit="人" href={link("/reports", { tab: "workers", status: undefined })} caption={`名簿 ${head.rows}行${head.rows === head.total ? "" : "・掛け持ちあり"}`} />
        <Kpi label="出勤" value={head.attend} unit="人" tone="orange" icon={<HardHat className="h-5 w-5" />} href={link("/reports", { tab: "workers", status: "出勤" })} caption={head.doubleAttend ? `2現場 ${head.doubleAttend}人` : "実人数"} />
        <Kpi label="休み" value={head.rest} unit="人" icon={<Minus className="h-5 w-5" />} href={link("/reports", { tab: "workers", status: "休み" })} caption={head.vacation ? `うち休暇 ${head.vacation}` : "休暇を含む"} />
        <Kpi label="欠勤" value={head.absent} unit="人" tone="red" icon={<X className="h-5 w-5" />} href={link("/reports", { tab: "workers", status: "欠勤" })} />
        <Kpi label="未入力" value={head.unknown} unit="人" tone="orange" icon={<CircleHelp className="h-5 w-5" />} href={link("/reports", { tab: "workers", status: "未入力" })} />
        <LinkCard href={link("/reports", { tab: "trend" })} className="flex items-center justify-between px-4">
          <div>
            <div className="text-[13px] text-neutral-400">出勤率</div>
            <div className="num text-[40px] leading-none text-[#ff6a00]">{head.rate ?? 0}%</div>
            <div className={`mt-1 text-xs font-bold ${delta !== null && delta < 0 ? "text-[#ff5c5c]" : "text-[#3dd68c]"}`}>前日比 {delta === null ? "—" : `${delta > 0 ? "+" : ""}${delta}%`}</div>
          </div>
          <Ring value={head.rate ?? 0} />
        </LinkCard>
      </section>
      {doubles.length > 0 && (
        <Link href={link("/alerts")} className="flex shrink-0 items-center gap-2 rounded-md border border-[#ff6a00]/70 bg-[#24180f] px-3 py-2 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0 text-[#ff6a00]" />
          <span className="font-black text-[#ff8a33]">同日2現場出勤 {doubles.length}人</span>
          <span className="truncate text-neutral-300">{doubles.map((person) => `${person.name}（${person.sites.map(ledgerNames).join("・")}）`).join("　")}</span>
        </Link>
      )}
      <section className="grid min-h-0 flex-[1.05] grid-cols-5 gap-3">
        <article className="panel col-span-2 flex min-h-0 flex-col p-3">
          <h2 className="mb-1 flex items-center gap-2 text-sm font-bold"><MapPin className="h-4 w-4 text-[#ff6a00]" />地域別出面状況</h2>
          <div className="min-h-0 flex-1"><JapanMap regions={regions} /></div>
          <p className="text-[12px] text-neutral-500">■ 出勤人数 / 登録人数（実人数。掛け持ちは地域ごとに数えます）</p>
        </article>
        <article className="panel col-span-3 flex min-h-0 flex-col p-3">
          <h2 className="flex items-center gap-2 text-sm font-bold"><LineChart className="h-4 w-4 text-[#ff6a00]" />日別出勤人数推移（直近14日間）</h2>
          <div className="min-h-0 flex-1"><TrendChart data={series} /></div>
        </article>
      </section>
      <SiteTable sites={sites} link={link} />
      <footer className="hazard-thin flex h-8 shrink-0 items-center justify-center rounded text-[12px] font-bold tracking-widest text-white/90">
        <span className="bg-[#0e0e0e] px-4">安全第一　|　品質向上　|　チームグリュック</span>
      </footer>
    </div>
  );
}

function Kpi({ label, value, unit, caption, tone, icon, href }: { label: string; value: number; unit: string; caption?: string; tone?: "orange" | "red"; icon?: ReactNode; href: string }) {
  const color = tone === "red" ? "text-[#ff5c5c]" : tone === "orange" ? "text-[#ff6a00]" : "text-white";
  return (
    <LinkCard href={href}>
      <div className="text-[13px] text-neutral-400">{label}</div>
      <div className="mt-1 flex items-end justify-between">
        <div className="flex items-baseline gap-1">
          <span className={`num text-[40px] leading-none ${color}`}>{value}</span>
          <span className="text-sm text-neutral-400">{unit}</span>
        </div>
        <span className={color}>{icon}</span>
      </div>
      {caption && <div className="mt-1 truncate text-[12px] text-neutral-500">{caption}</div>}
    </LinkCard>
  );
}

function LinkCard({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  return (
    <Link href={href} className={`panel block px-3 py-2.5 transition hover:border-[#ff6a00] ${className || ""}`}>{children}</Link>
  );
}

function SiteTable({ sites, link }: { sites: SiteStat[]; link: (path: string, extra?: Record<string, string | undefined>) => string }) {
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: "code", dir: 1 });
  const sorted = [...sites].sort((a, b) => {
    const pick = (site: SiteStat) => {
      if (sort.key === "name") return site.name;
      if (sort.key === "region") return site.region;
      if (sort.key === "total") return site.head.total;
      if (sort.key === "attend") return site.head.attend;
      if (sort.key === "rate") return site.head.rate ?? -1;
      if (sort.key === "short") return site.shortage ?? 999;
      return site.code;
    };
    const av = pick(a);
    const bv = pick(b);
    return (av > bv ? 1 : av < bv ? -1 : 0) * sort.dir;
  });
  const size = 6;
  const pages = Math.max(1, Math.ceil(sorted.length / size));
  const view = sorted.slice(page * size, page * size + size);
  const from = sorted.length ? page * size + 1 : 0;
  const to = Math.min(sorted.length, page * size + size);
  function toggle(key: string) {
    setSort((current) => ({ key, dir: current.key === key && current.dir === 1 ? -1 : 1 }));
    setPage(0);
  }
  return (
    <section className="panel flex min-h-0 flex-[1.15] flex-col">
      <div className="flex items-center gap-2 px-3 py-2">
        <h2 className="text-sm font-bold">現場別出面一覧</h2>
        <div className="ml-auto flex items-center gap-3 text-sm">
          <Link href={link("/sites")} className="font-bold text-neutral-200 hover:text-[#ff6a00]">全現場を表示</Link>
          <a href={link("/api/export", { kind: "sites" })} className="text-[#ff6a00]" aria-label="CSVを書き出す">
            <Download className="h-5 w-5" />
          </a>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse text-left text-[14px]">
          <thead className="sticky top-0 bg-[#1b1b1b] text-[12px] text-neutral-400">
            <tr>
              {[
                ["code", "現場コード"],
                ["name", "現場名"],
                ["region", "地域"],
                ["manager", "担当者"],
                ["total", "全体人数"],
                ["attend", "出勤"],
                ["rest", "休み"],
                ["absent", "欠勤"],
                ["unknown", "未入力"],
                ["rate", "出勤率"],
                ["short", "ステータス"],
              ].map(([key, label]) => (
                <th key={key} className="px-2 py-2 font-medium">
                  <button className="hover:text-white" onClick={() => toggle(key)}>{label}</button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.map((site) => {
              const label = statusLabel(site);
              return (
                <tr key={site.pi} className="border-t border-[#262626] hover:bg-white/[0.03]">
                  <td className="px-2 py-2 text-neutral-400">{site.code}</td>
                  <td className="px-2 py-2 font-bold"><Link href={link(`/sites/${site.pi}`)} className="hover:text-[#ff6a00]">{site.name}</Link></td>
                  <td className="px-2 py-2">{site.region}</td>
                  <td className="px-2 py-2">{site.manager}</td>
                  <td className="px-2 py-2 text-center font-bold">{site.head.total}{site.head.move > 0 && <span className="ml-1 text-[10px] font-medium text-neutral-500">移{site.head.move}</span>}</td>
                  <td className="px-2 py-2 text-center font-bold text-[#ff6a00]">{site.head.attend}</td>
                  <td className="px-2 py-2 text-center">{site.head.rest}</td>
                  <td className="px-2 py-2 text-center text-[#ff5c5c]">{site.head.absent}</td>
                  <td className="px-2 py-2 text-center text-[#ffb067]">{site.head.unknown}</td>
                  <td className="px-2 py-2 text-center font-bold text-[#ff6a00]">{site.head.rate ?? 0}%</td>
                  <td className={`px-2 py-2 text-[13px] font-bold ${label.tone === "ok" ? "text-neutral-500" : "text-[#ff8a33]"}`}>
                    {label.tone !== "ok" && <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />}
                    {label.text}
                  </td>
                </tr>
              );
            })}
            {!view.length && <tr><td colSpan={11} className="px-3 py-8 text-center text-neutral-500">該当する現場がありません。</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between border-t border-[#262626] px-3 py-1.5 text-xs text-neutral-400">
        <span>表示中 {from} - {to} / {sorted.length} 件</span>
        <div className="flex items-center gap-2">
          <button className="grid h-8 w-8 place-items-center disabled:opacity-30" disabled={page === 0} onClick={() => setPage((value) => value - 1)} aria-label="前のページ"><ChevronLeft className="h-4 w-4" /></button>
          <span className="grid h-7 w-7 place-items-center rounded bg-[#ff6a00] font-bold text-black">{page + 1}</span>
          <button className="grid h-8 w-8 place-items-center disabled:opacity-30" disabled={page >= pages - 1} onClick={() => setPage((value) => value + 1)} aria-label="次のページ"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>
    </section>
  );
}

function MobileHome({ date, model, moveDay, setDate, link }: {
  date: string;
  model: HomeModel;
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
