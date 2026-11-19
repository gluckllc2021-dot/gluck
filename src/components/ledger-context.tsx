"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Ledger, ReviewEvent } from "@/lib/attendance";
import { shiftDate as moveDate, todayJST } from "@/lib/utils";

export type AppUser = { id: string; email: string; name: string; role: "admin" | "editor" | "viewer" };
export type SyncInfo = { at: string | null; ok: boolean; message: string; warningCount: number };
export type SheetAlert = { level: string; code: string; tab: string; project: string; message: string };

type State = {
  user: AppUser | null;
  ledger: Ledger | null;
  events: ReviewEvent[];
  revision: number;
  canEdit: boolean;
  loading: boolean;
  error: string;
  refreshedAt: Date | null;
  sync: SyncInfo | null;
  sheetAlerts: SheetAlert[];
  date: string;
  region: string;
  project: string;
  setDate: (day: string) => void;
  moveDay: (days: number) => void;
  setRegion: (region: string) => void;
  setProject: (project: string) => void;
  reload: () => Promise<void>;
  hold: (on: boolean) => void;
  link: (path: string, extra?: Record<string, string | undefined>) => string;
};

const Ctx = createContext<State | null>(null);

export function useLedger() {
  const value = useContext(Ctx);
  if (!value) throw new Error("台帳の読み込み中です");
  return value;
}

export function LedgerProvider({ children }: { children: React.ReactNode }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const date = params.get("date") || todayJST();
  const region = params.get("region") || "";
  const project = params.get("project") || "";
  const [user, setUser] = useState<AppUser | null>(null);
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [events, setEvents] = useState<ReviewEvent[]>([]);
  const [revision, setRevision] = useState(0);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);
  const [sync, setSync] = useState<SyncInfo | null>(null);
  const [sheetAlerts, setSheetAlerts] = useState<SheetAlert[]>([]);
  const holdRef = useRef(false);
  const requestId = useRef(0);

  const link = useCallback(
    (path: string, extra?: Record<string, string | undefined>) => {
      const next = new URLSearchParams(params.toString());
      if (!next.get("date")) next.set("date", date);
      for (const [key, value] of Object.entries(extra ?? {})) {
        if (!value) next.delete(key);
        else next.set(key, value);
      }
      const query = next.toString();
      return query ? `${path}?${query}` : path;
    },
    [params, date],
  );

  const replaceQuery = useCallback(
    (extra: Record<string, string | undefined>) => {
      router.replace(link(pathname, extra), { scroll: false });
    },
    [link, pathname, router],
  );

  const reload = useCallback(async () => {
    const id = ++requestId.current;
    try {
      const response = await fetch(`/api/state?date=${encodeURIComponent(date)}`, { cache: "no-store" });
      if (response.status === 401) {
        window.location.href = "/login";
        return;
      }
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "台帳を読み込めませんでした。");
      if (id !== requestId.current) return;
      setUser({ id: body.userId, email: "", name: body.userName, role: body.role });
      setLedger(body.ledger);
      setEvents(body.events || []);
      setRevision(body.sourceRevision || 0);
      setCanEdit(!!body.canEdit);
      setRefreshedAt(new Date());
      setSync(body.sync || null);
      setSheetAlerts(body.sheetAlerts || []);
      setError("");
    } catch (caught) {
      if (id === requestId.current) setError(caught instanceof Error ? caught.message : "台帳を読み込めませんでした。");
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    setLoading(true);
    void reload();
  }, [reload]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!holdRef.current && document.visibilityState === "visible") void reload();
    }, 60000);
    return () => window.clearInterval(timer);
  }, [reload]);

  const value = useMemo<State>(
    () => ({
      user,
      ledger,
      events,
      revision,
      canEdit,
      loading,
      error,
      refreshedAt,
      sync,
      sheetAlerts,
      date,
      region,
      project,
      setDate: (day) => replaceQuery({ date: day }),
      moveDay: (days) => replaceQuery({ date: moveDate(date, days) }),
      setRegion: (next) => replaceQuery({ region: next || undefined, project: undefined }),
      setProject: (next) => replaceQuery({ project: next || undefined }),
      reload,
      hold: (on) => {
        holdRef.current = on;
      },
      link,
    }),
    [user, ledger, events, revision, canEdit, loading, error, refreshedAt, sync, sheetAlerts, date, region, project, replaceQuery, reload, link],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
