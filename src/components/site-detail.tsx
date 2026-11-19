"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { companyOf, core, isUnknown, missing, projectCode, projectManager, projectName, projectRegion } from "@/lib/attendance";
import { headcount, peopleRollup, statusLabel } from "@/lib/aggregate";
import { useLedger } from "./ledger-context";
import { MobilePageHeader } from "./shell";
import { CorrectionDialog } from "./correction-dialog";
import { Button } from "@/components/ui/button";

export function SiteDetail({ id }: { id: string }) {
  const pi = Number(id);
  const { ledger, events, date, canEdit, link } = useLedger();
  const params = useSearchParams();
  const initial = params.get("edit") || "";
  const [editKey, setEditKey] = useState<string | null>(initial || null);
  const [open, setOpen] = useState(!!initial);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState(params.get("status") || "すべて");
  const model = useMemo(() => {
    if (!ledger || !ledger.p[pi]) return null;
    const snap = core(ledger, events, date);
    const rows = snap.rows.filter((row) => row.pi === pi);
    const query = q.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
    const filtered = rows.filter((row) => {
      const blob = `${row.n}${companyOf(row)}`.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
      if (query && !blob.includes(query)) return false;
      if (status === "すべて") return true;
      if (status === "未入力" || status === "未確認") return isUnknown(row.a);
      if (status === "休み") return row.a.s === "休み" || row.a.s === "休暇";
      return row.a.s === status;
    });
    return { rows: filtered, head: headcount(rows), need: snap.needs.get(pi), shortage: missing(rows, snap.needs, pi), all: rows };
  }, [ledger, events, date, pi, q, status]);

  if (!ledger || !model) return <p className="p-6">現場が見つかりません。</p>;
  const doubled = new Set(peopleRollup(core(ledger, events, date).rows).filter((person) => person.doubleAttend).map((person) => person.key));
  const label = statusLabel({ ...model, pi, name: "", region: "", code: "", manager: "", required: model.need?.value ?? null, requiredCertainty: model.need?.c ?? null, reason: null, rate: model.head.rate, rows: model.all, head: model.head, shortage: model.shortage });

  return (
    <div className="mx-auto max-w-[1400px] px-3 py-3 lg:px-6">
      <MobilePageHeader title={projectName(ledger, pi)} back="/" />
      <div className="mb-4 hidden items-center gap-3 lg:flex">
        <a href={link("/")} className="text-sm text-[#ff8a33]">ダッシュボードへ戻る</a>
      </div>
      <div className="panel p-4 lg:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-sm text-neutral-400">{projectCode(ledger, pi)}　{projectRegion(ledger, pi)}　担当 {projectManager(ledger, pi)}</div>
            <h1 className="text-2xl font-black lg:text-3xl">{projectName(ledger, pi)}</h1>
          </div>
          {canEdit && <Button className="h-12 bg-[#ff6a00] font-black text-black hover:bg-[#ff8a1f]" onClick={() => { setEditKey(""); setOpen(true); }}>訂正・確認を登録</Button>}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          <Stat label="実人数" value={model.head.total} />
          <Stat label="出勤" value={model.head.attend} orange />
          <Stat label="休み" value={model.head.rest} />
          <Stat label="欠勤" value={model.head.absent} />
          <Stat label="未入力" value={model.head.unknown} />
          <Stat label="必要 / 不足" value={`${model.need?.value ?? "—"} / ${model.shortage ?? label.text}`} />
        </div>
        {(model.head.groups > 0 || model.head.move > 0) && (
          <p className="mt-3 text-sm text-neutral-400">
            {model.head.groups > 0 && `会社一括 ${model.head.groups}件・グループ人工 ${model.head.groupHours}（人数に含めていません） `}
            {model.head.move > 0 && `移動 ${model.head.move}人は出勤に含めていません`}
          </p>
        )}
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input className="field" placeholder="作業員・所属会社" value={q} onChange={(event) => setQ(event.target.value)} />
        <select className="field sm:w-48" value={status} onChange={(event) => setStatus(event.target.value)}>
          {["すべて", "出勤", "休み", "欠勤", "未入力", "移動", "名簿外"].map((item) => <option key={item}>{item}</option>)}
        </select>
      </div>
      <div className="mt-3 space-y-2 md:hidden">
        {model.rows.map((row) => (
          <article key={row.key} className="panel p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-lg font-black">{row.n}</div>
                <div className="text-sm text-neutral-400">{companyOf(row)}　{row.a.group ? "会社一括" : "個人"}</div>
              </div>
              <Status s={row.a.s} />
            </div>
            {doubled.has(row.n.normalize("NFKC").replace(/\s+/g, "")) && <p className="mt-2 text-sm font-bold text-[#ffb067]">同日に別現場でも出勤</p>}
            <p className="mt-2 text-sm text-neutral-400">労働 {row.work.length}日　欠勤 {row.miss.length}日　人工 {row.total}</p>
            {canEdit && <Button className="mt-3 h-11 w-full" variant="outline" onClick={() => { setEditKey(row.key); setOpen(true); }}>訂正する</Button>}
          </article>
        ))}
        {!model.rows.length && <p className="py-8 text-center text-neutral-500">該当する作業員はいません。</p>}
      </div>
      <div className="panel mt-3 hidden overflow-auto md:block">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-[#1b1b1b] text-neutral-400">
            <tr>{["作業員", "所属", "状態", "確度", "人工", "月労働", "月欠勤", ""].map((label) => <th key={label} className="px-3 py-2 font-medium">{label}</th>)}</tr>
          </thead>
          <tbody>
            {model.rows.map((row) => (
              <tr key={row.key} className="border-t border-[#262626]">
                <td className="px-3 py-2 font-bold">
                  {row.n}
                  {doubled.has(row.n.normalize("NFKC").replace(/\s+/g, "")) && <span className="ml-2 text-xs text-[#ffb067]">2現場</span>}
                </td>
                <td className="px-3 py-2">{companyOf(row)}</td>
                <td className="px-3 py-2"><Status s={row.a.s} /></td>
                <td className="px-3 py-2">{row.a.c}</td>
                <td className="px-3 py-2">{row.a.value ?? (/時間|残業/.test(row.a.raw || "") ? row.a.raw : "—")}</td>
                <td className="px-3 py-2">{row.work.length}</td>
                <td className="px-3 py-2">{row.miss.length}</td>
                <td className="px-3 py-2">{canEdit && <button className="font-bold text-[#ff6a00]" onClick={() => { setEditKey(row.key); setOpen(true); }}>訂正</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <CorrectionDialog open={open} onOpenChange={setOpen} pi={pi} rowKey={editKey || undefined} />
    </div>
  );
}

function Stat({ label, value, orange }: { label: string; value: string | number; orange?: boolean }) {
  return (
    <div className="rounded-lg bg-black/40 px-3 py-2">
      <div className="text-xs text-neutral-400">{label}</div>
      <div className={`num text-2xl ${orange ? "text-[#ff6a00]" : ""}`}>{value}</div>
    </div>
  );
}

function Status({ s }: { s: string }) {
  const tone = s === "出勤" ? "bg-[#ff6a00] text-black" : s === "欠勤" ? "bg-[#7a2a2a] text-white" : s === "休み" || s === "休暇" ? "bg-[#3f3f3f] text-white" : "bg-[#2a241c] text-[#ffb067]";
  return <span className={`rounded px-2 py-1 text-xs font-black ${tone}`}>{s}</span>;
}
