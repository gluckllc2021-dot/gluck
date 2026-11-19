"use client";

import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLedger } from "./ledger-context";

type Mapping = { tab: string; projectName: string; region: string; include: boolean; discovered?: boolean };
type SheetRow = {
  id: string;
  url: string;
  title: string;
  month: string;
  spreadsheetId: string;
  mappings: Mapping[];
  lastSyncAt: string | null;
  lastOk: boolean;
  lastMessage: string;
  lastWarningCount: number;
};

export function SheetAdmin() {
  const { reload } = useLedger();
  const [intervalMinutes, setIntervalMinutes] = useState(5);
  const [sheets, setSheets] = useState<SheetRow[]>([]);
  const [alerts, setAlerts] = useState<{ level: string; message: string; code: string }[]>([]);
  const [url, setUrl] = useState("");
  const [month, setMonth] = useState("2026-11");
  const [busy, setBusy] = useState(false);

  async function load() {
    const response = await fetch("/api/sheets", { cache: "no-store" });
    if (!response.ok) return;
    const body = await response.json();
    setIntervalMinutes(body.intervalMinutes || 5);
    setSheets(body.sheets || []);
    setAlerts(body.alerts || []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function syncNow() {
    setBusy(true);
    const response = await fetch("/api/sheets/sync", { method: "POST" });
    const body = await response.json();
    setBusy(false);
    if (!response.ok) return toast.error(body.error || "同期できませんでした。");
    setSheets(body.sheets || []);
    setAlerts(body.alerts || []);
    toast.success(body.sync?.message || "同期しました");
    await reload();
  }

  async function addSheet(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    const response = await fetch("/api/sheets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, month }),
    });
    const body = await response.json();
    setBusy(false);
    if (!response.ok) return toast.error(body.error || "登録できませんでした。");
    setUrl("");
    setSheets(body.sheets || []);
    setAlerts(body.alerts || []);
    toast.success("シートを登録して同期しました");
    await reload();
  }

  async function save(sheet: SheetRow) {
    const response = await fetch("/api/sheets", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sheetId: sheet.id, mappings: sheet.mappings, intervalMinutes }),
    });
    const body = await response.json();
    if (!response.ok) return toast.error(body.error || "保存できませんでした。");
    setSheets(body.sheets || []);
    toast.success("対応表を保存しました。次回の同期から反映されます。");
  }

  function patchMapping(sheet: SheetRow, index: number, patch: Partial<Mapping>) {
    const mappings = sheet.mappings.slice();
    mappings[index] = { ...mappings[index], ...patch };
    setSheets(sheets.map((item) => item.id === sheet.id ? { ...item, mappings } : item));
  }

  return (
    <section className="brand-card mb-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="brand-kicker">SHEET SYNC</p>
          <h2 className="mt-1 text-xl font-black">スプレッドシート同期</h2>
          <p className="mt-1 text-sm text-white/65">月ごとに別のシートを登録します。過去月は残したまま同期し、画面で直した出面は上書きしません。</p>
        </div>
        <Button className="h-12 bg-[#ff6a00] font-black text-black hover:bg-[#ff8a1f]" disabled={busy} onClick={() => void syncNow()}>
          {busy ? "同期中…" : "今すぐ同期"}
        </Button>
      </div>
      <label className="mt-4 grid max-w-xs gap-1 text-sm text-white/80">
        自動同期の間隔（分）
        <Input className="h-11 border-white/15 bg-[#071a33]" type="number" min={1} max={120} value={intervalMinutes} onChange={(event) => setIntervalMinutes(Number(event.target.value))} />
      </label>
      <form className="mt-3 grid gap-2 md:grid-cols-[1fr_160px_auto]" onSubmit={addSheet}>
        <Input className="h-11 border-white/15 bg-[#071a33]" placeholder="スプレッドシートのURLを貼り付け" value={url} onChange={(event) => setUrl(event.target.value)} />
        <Input className="h-11 border-white/15 bg-[#071a33]" type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
        <Button className="h-11 border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white" variant="outline">登録して同期</Button>
      </form>
      {sheets.map((sheet) => (
        <div key={sheet.id} className="mt-4 rounded-xl border border-white/10 bg-[#071a33]/70 p-3 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="font-black">{sheet.title || sheet.spreadsheetId}</div>
              <div className="text-xs text-white/50">{sheet.lastMessage || "未同期"}{sheet.lastSyncAt ? `　${new Date(sheet.lastSyncAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}` : ""}</div>
            </div>
            <Button className="h-10 border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white" variant="outline" onClick={() => void save(sheet)}>対応表を保存</Button>
          </div>
          <div className="mt-3 hidden overflow-auto md:block">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-[#f2c300]">
                <tr>
                  <th className="py-1 pr-2 font-semibold">取り込む</th>
                  <th className="py-1 pr-2 font-semibold">タブ名</th>
                  <th className="py-1 pr-2 font-semibold">サイトの案件名</th>
                  <th className="py-1 font-semibold">地域</th>
                </tr>
              </thead>
              <tbody>
                {sheet.mappings.map((mapping, index) => (
                  <tr key={mapping.tab} className="border-t border-white/10">
                    <td className="py-2">
                      <input className="h-4 w-4 accent-[#ff6a00]" type="checkbox" checked={mapping.include} onChange={(event) => patchMapping(sheet, index, { include: event.target.checked })} />
                    </td>
                    <td className="py-2 pr-2">
                      {mapping.tab}
                      {mapping.discovered && <span className="ml-2 rounded bg-[#ff6a00] px-1.5 py-0.5 text-[11px] font-black text-black">新着</span>}
                    </td>
                    <td className="py-2 pr-2">
                      <Input className="h-10 border-white/15 bg-[#0b2545]" value={mapping.projectName} onChange={(event) => patchMapping(sheet, index, { projectName: event.target.value })} />
                    </td>
                    <td className="py-2">
                      <Input className="h-10 border-white/15 bg-[#0b2545]" value={mapping.region} onChange={(event) => patchMapping(sheet, index, { region: event.target.value })} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 space-y-3 md:hidden">
            {sheet.mappings.map((mapping, index) => (
              <div key={mapping.tab} className="rounded-lg border border-white/10 p-3">
                <label className="flex items-center gap-2 text-sm font-bold">
                  <input className="h-5 w-5 accent-[#ff6a00]" type="checkbox" checked={mapping.include} onChange={(event) => patchMapping(sheet, index, { include: event.target.checked })} />
                  {mapping.tab}
                  {mapping.discovered && <span className="rounded bg-[#ff6a00] px-1.5 py-0.5 text-[11px] font-black text-black">新着</span>}
                </label>
                <label className="mt-2 grid gap-1 text-xs text-white/60">
                  サイトの案件名
                  <Input className="h-11 border-white/15 bg-[#0b2545]" value={mapping.projectName} onChange={(event) => patchMapping(sheet, index, { projectName: event.target.value })} />
                </label>
                <label className="mt-2 grid gap-1 text-xs text-white/60">
                  地域
                  <Input className="h-11 border-white/15 bg-[#0b2545]" value={mapping.region} onChange={(event) => patchMapping(sheet, index, { region: event.target.value })} />
                </label>
              </div>
            ))}
          </div>
        </div>
      ))}
      {alerts.length > 0 && (
        <div className="mt-4">
          <h3 className="font-black">直近の同期ログ</h3>
          <ul className="mt-2 space-y-1 text-sm text-white/80">
            {alerts.filter((alert) => alert.level === "alert").slice(0, 12).map((alert, index) => (
              <li key={index} className="rounded-lg border border-white/10 bg-[#071a33] px-3 py-2">{alert.message}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
