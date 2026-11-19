"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertTriangle,
  BarChart3,
  Bell,
  Building2,
  ChevronLeft,
  HardHat,
  Home,
  List,
  LogOut,
  MapPin,
  Menu,
  Settings,
} from "lucide-react";
import { useMemo, useState } from "react";
import { core, projectRegion } from "@/lib/attendance";
import { peopleRollup, siteStats } from "@/lib/aggregate";
import { timeJST } from "@/lib/utils";
import { useLedger } from "./ledger-context";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="grid h-9 w-9 place-items-center rounded-md bg-[#ff6a00] text-[22px] font-black italic leading-none text-[#1a0c00]">G</div>
      <div className="text-[15px] font-bold leading-tight">グリュック合同会社</div>
    </div>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const ledgerState = useLedger();
  const { ledger, events, date, region, project, setRegion, setProject, refreshedAt, sync, link, user } = ledgerState;
  const regions = useMemo(() => (ledger ? [...new Set(ledger.p.map((item) => String(item[1] || "地域未確認")))] : []), [ledger]);
  const projects = useMemo(() => {
    if (!ledger) return [];
    return ledger.p.map((item, index) => ({ index, name: String(item[0]), region: String(item[1]) })).filter((item) => !region || item.region === region);
  }, [ledger, region]);
  const alerts = useMemo(() => {
    if (!ledger) return 0;
    const snap = core(ledger, events, date);
    const scope = { region, project };
    const sites = siteStats(ledger, snap.rows.filter((row) => (!region || projectRegion(ledger, row.pi) === region) && (!project || String(row.pi) === project)), snap.needs, scope);
    const short = sites.filter((site) => (site.shortage ?? 0) > 0).length;
    const rows = snap.rows.filter((row) => (!region || projectRegion(ledger, row.pi) === region) && (!project || String(row.pi) === project));
    const doubled = peopleRollup(rows).filter((person) => person.doubleAttend).length;
    return short + doubled;
  }, [ledger, events, date, region, project]);

  async function logout() {
    await fetch("/api/auth/session", { method: "POST" });
    window.location.href = "/login";
  }

  const menu = [
    ["/", "ダッシュボード", Home],
    ["/sites", "現場一覧", List],
    ["/alerts", "アラート", AlertTriangle],
    ["/reports", "実績・レポート", BarChart3],
    ["/settings", "設定", Settings],
  ] as const;

  return (
    <div className="flex min-h-dvh flex-col bg-[#0e0e0e] lg:h-dvh lg:overflow-hidden">
      <header className="no-print hidden h-[60px] shrink-0 items-center gap-4 border-b border-[#2a2a2a] bg-[#101010] px-4 lg:flex">
        <Logo />
        <div className="hazard-thin h-8 w-16 rounded-sm" />
        <div className="text-[22px] font-black tracking-wide">出面確認台帳</div>
        <div className="hazard-thin h-8 w-16 rounded-sm" />
        <div className="ml-auto flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-neutral-300">
            <MapPin className="h-4 w-4 text-[#ff6a00]" />
            地域
            <select className="field h-9 w-[132px]" value={region} onChange={(event) => setRegion(event.target.value)} aria-label="地域">
              <option value="">すべて</option>
              {regions.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-neutral-300">
            <Building2 className="h-4 w-4 text-[#ff6a00]" />
            現場
            <select className="field h-9 w-[210px]" value={project} onChange={(event) => setProject(event.target.value)} aria-label="現場">
              <option value="">すべて</option>
              {projects.map((item) => (
                <option key={item.index} value={item.index}>{item.name}</option>
              ))}
            </select>
          </label>
          <div className="px-2 text-sm text-neutral-400">
            更新: {sync?.at ? timeJST(new Date(sync.at)) : refreshedAt ? timeJST(refreshedAt) : "--:--"}
            {sync ? <span className={sync.warningCount ? "ml-2 font-bold text-[#ffb067]" : "ml-2 text-neutral-500"}>{sync.message}</span> : null}
          </div>
          <Link href={link("/alerts")} className="relative grid h-10 w-10 place-items-center rounded-md hover:bg-white/5" aria-label="アラート">
            <Bell className="h-5 w-5" />
            {alerts > 0 && <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-[#ff6a00] px-1 text-[10px] font-bold text-black">{alerts}</span>}
          </Link>
          <MenuButton menu={menu} path={path} link={link} logout={logout} user={user?.name || ""} />
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-auto pb-24 lg:overflow-hidden lg:pb-0">{children}</div>
      <nav className="no-print fixed inset-x-0 bottom-0 z-40 grid h-[76px] grid-cols-5 border-t border-white/10 bg-[#0c0c0c] pb-[env(safe-area-inset-bottom)] lg:hidden">
        <Tab href={link("/")} active={path === "/"} icon={Home} label="ダッシュボード" />
        <Tab href={link("/sites")} active={path.startsWith("/sites")} icon={List} label="現場一覧" />
        <Link href={link("/alerts")} className="relative -mt-7 flex flex-col items-center gap-1 text-[11px] font-bold text-[#ff6a00]">
          <span className="grid h-16 w-16 place-items-center rounded-full bg-[#ff6a00] text-black shadow-[0_8px_24px_rgba(255,106,0,0.45)]">
            <AlertTriangle className="h-7 w-7" />
          </span>
          アラート
        </Link>
        <Tab href={link("/reports")} active={path.startsWith("/reports")} icon={BarChart3} label="実績・レポート" />
        <Tab href={link("/settings")} active={path.startsWith("/settings")} icon={Settings} label="設定" />
      </nav>
    </div>
  );
}

function Tab({ href, active, icon: Icon, label }: { href: string; active: boolean; icon: typeof Home; label: string }) {
  return (
    <Link href={href} className={`flex min-w-0 flex-col items-center justify-center gap-1 px-0.5 text-center text-[10px] font-bold leading-tight ${active ? "text-[#ff6a00]" : "text-neutral-400"}`}>
      <Icon className="h-5 w-5" />
      {label}
    </Link>
  );
}

function MenuButton({ menu, path, link, logout, user }: { menu: readonly (readonly [string, string, typeof Home])[]; path: string; link: (path: string) => string; logout: () => void; user: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger className="grid h-10 w-10 place-items-center rounded-md hover:bg-white/5" aria-label="メニュー">
        <Menu className="h-5 w-5" />
      </SheetTrigger>
      <SheetContent className="bg-[#121212] text-white">
        <SheetHeader>
          <SheetTitle className="text-white">メニュー</SheetTitle>
        </SheetHeader>
        <div className="mt-2 px-4 text-sm text-neutral-400">{user}</div>
        <div className="mt-4 grid gap-1 px-2">
          {menu.map(([href, label, Icon]) => (
            <Link key={href} href={link(href)} onClick={() => setOpen(false)} className={`flex h-12 items-center gap-3 rounded-lg px-3 text-[15px] font-bold ${path === href ? "bg-[#ff6a00] text-black" : "hover:bg-white/5"}`}>
              <Icon className="h-5 w-5" />
              {label}
            </Link>
          ))}
          <button onClick={logout} className="flex h-12 items-center gap-3 rounded-lg px-3 text-left text-[15px] font-bold text-neutral-200 hover:bg-white/5">
            <LogOut className="h-5 w-5" />
            ログアウト
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function MobilePageHeader({ title, back }: { title: string; back?: string }) {
  const { link } = useLedger();
  return (
    <div className="hazard lg:hidden">
      <div className="flex h-14 items-center gap-2 bg-black/55 px-3 backdrop-blur-sm">
        {back && (
          <Link href={link(back)} className="grid h-11 w-11 place-items-center" aria-label="戻る">
            <ChevronLeft />
          </Link>
        )}
        <div className="flex items-center gap-2 text-lg font-black">
          <HardHat className="h-5 w-5 text-[#ff6a00]" />
          {title}
        </div>
      </div>
    </div>
  );
}
