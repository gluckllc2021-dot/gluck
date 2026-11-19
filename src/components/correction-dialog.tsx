"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { contactText, core, projectName } from "@/lib/attendance";
import { validateDraft, type Draft } from "@/lib/review";
import { todayJST } from "@/lib/utils";
import { useLedger } from "./ledger-context";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const STATUSES = ["未入力", "出勤", "休み", "欠勤", "休暇", "移動", "未確認", "当日対象外", "名簿外"];

export function CorrectionDialog({ open, onOpenChange, pi, rowKey }: { open: boolean; onOpenChange: (open: boolean) => void; pi?: number; rowKey?: string }) {
  const { ledger, events, date, revision, user, reload, hold } = useLedger();
  const [kind, setKind] = useState("src");
  const [project, setProject] = useState(0);
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [group, setGroup] = useState(false);
  const [status, setStatus] = useState("未確認");
  const [actual, setActual] = useState(0);
  const [hours, setHours] = useState("");
  const [certainty, setCertainty] = useState("未確認");
  const [required, setRequired] = useState("0");
  const [flag, setFlag] = useState("指定なし");
  const [check, setCheck] = useState(todayJST());
  const [ref, setRef] = useState("");
  const [next, setNext] = useState("");
  const [memo, setMemo] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const choices = useMemo(() => {
    if (!ledger) return [];
    const map = new Map<string, string>();
    ledger.r.forEach((row, index) => {
      if (Number(row[0]) === project) map.set("b" + index, String(row[1] ?? ""));
    });
    for (const event of events) {
      if ((event.pi === project || event.actual === project) && event.key && event.n) map.set(event.key, event.n);
    }
    for (const row of core(ledger, events, date).rows) {
      if (row.pi === project) map.set(row.key, row.n);
    }
    return [...map];
  }, [ledger, events, date, project]);

  useEffect(() => {
    if (!open) return;
    hold(true);
    setKind("src");
    setProject(pi ?? 0);
    setKey(rowKey || "");
    setCheck(todayJST());
    setRef("");
    setNext("");
    setMemo("");
    setMessage("");
    return () => hold(false);
  }, [open, pi, rowKey, hold]);

  useEffect(() => {
    if (!open || !ledger) return;
    const row = core(ledger, events, date).rows.find((item) => item.key === key);
    const index = /^b\d+$/.test(key) ? Number(key.slice(1)) : -1;
    const base = index >= 0 ? ledger.r[index] : undefined;
    const current = kind === "detail" ? row?.b : row?.a;
    setName(row?.n || String(base?.[1] ?? "") || choices.find(([id]) => id === key)?.[1] || "");
    setCompany(current?.co || row?.a.co || String(base?.[2] ?? ""));
    setGroup(!!(current?.group || row?.a.group || base?.[3]));
    setActual(current?.p ?? row?.pi ?? project);
    if (current?.known) {
      setStatus(current.s === "チェックなし" ? "未確認" : current.s);
      setCertainty(current.c);
      setHours(current.value === null || current.value === undefined ? "" : String(current.value));
    } else {
      setStatus("未確認");
      setCertainty("未確認");
      setHours("");
    }
  }, [open, ledger, events, date, key, kind, project, choices]);

  if (!ledger) return null;
  const row = core(ledger, events, date).rows.find((item) => item.key === key);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    const value = kind === "need" ? Number(required) : kind !== "note" && status === "出勤" && hours !== "" ? Number(hours) : null;
    const draft: Draft = {
      t: kind,
      pi: project,
      key: kind === "need" ? "" : key,
      day: date,
      n: name,
      actual,
      c: certainty,
      check,
      ref,
      next,
      memo,
      value,
      s: status,
      co: company,
      g: group,
      flag,
    };
    const checked = validateDraft(draft, ledger!, events, todayJST());
    if (!checked.ok) {
      setMessage(checked.error);
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: draft, previous: events.at(-1)?.id ?? null, sourceRevision: revision }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "保存できませんでした。");
      toast.success("確認記録を保存しました。");
      await reload();
      onOpenChange(false);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "保存できませんでした。");
      await reload();
    } finally {
      setSaving(false);
    }
  }

  const showAttendance = kind === "src" || kind === "detail";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] max-w-3xl overflow-y-auto border-white/15 bg-[#0c1b30] text-white">
        <DialogHeader>
          <p className="text-[11px] font-semibold tracking-[0.2em] text-[#f2c300]">CORRECTION</p>
          <DialogTitle className="text-xl font-black">共有台帳を訂正</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-neutral-400">{row ? `原本 ${contactText(row.source)}　／　現在の台帳 ${contactText(row.a)}` : "根拠か確認方法を記入してください。原本の値は履歴に残ります。"}</p>
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={save}>
          <Field label="登録する内容">
            <select className="field" value={kind} onChange={(event) => setKind(event.target.value)}>
              <option value="src">勤務・氏名・所属・案件を訂正</option>
              <option value="detail">案件詳細の照合値を訂正</option>
              <option value="need">当日の必要人数</option>
              <option value="note">確認メモ・人員対応</option>
            </select>
          </Field>
          <Field label="対象日"><Input value={date} readOnly className="h-12" /></Field>
          <Field label="対象案件">
            <select className="field" value={project} onChange={(event) => { setProject(Number(event.target.value)); setKey(""); }}>
              {ledger.p.map((item, index) => <option key={index} value={index}>{projectName(ledger, index)}</option>)}
            </select>
          </Field>
          {kind !== "need" && (
            <Field label="照合する名簿行">
              <select className="field" value={key} onChange={(event) => setKey(event.target.value)}>
                <option value="">新しい名簿行</option>
                {choices.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select>
            </Field>
          )}
          {kind !== "need" && <Field label="作業員名・会社一括名"><Input value={name} onChange={(event) => setName(event.target.value)} maxLength={55} className="h-12" required /></Field>}
          {showAttendance && (
            <>
              <Field label="所属会社"><Input value={company} onChange={(event) => setCompany(event.target.value)} maxLength={55} className="h-12" /></Field>
              <Field label="名簿の単位">
                <select className="field" value={group ? "会社一括" : "個人"} onChange={(event) => setGroup(event.target.value === "会社一括")}>
                  <option>個人</option>
                  <option>会社一括</option>
                </select>
              </Field>
              <Field label="資料に表示された案件">
                <select className="field" value={actual} onChange={(event) => setActual(Number(event.target.value))}>
                  {ledger.p.map((item, index) => <option key={index} value={index}>{projectName(ledger, index)}</option>)}
                </select>
              </Field>
              <Field label="勤務状況">
                <select className="field" value={status} onChange={(event) => {
                  const nextStatus = event.target.value;
                  setStatus(nextStatus);
                  setCertainty(["未確認", "未入力"].includes(nextStatus) ? "未確認" : date > todayJST() ? "予定" : "確定");
                }}>
                  {STATUSES.map((item) => <option key={item}>{item}</option>)}
                </select>
              </Field>
              <Field label="数値人工"><Input type="number" min={0} step="0.01" value={hours} onChange={(event) => setHours(event.target.value)} placeholder="原本に数値がある時だけ" className="h-12" /></Field>
            </>
          )}
          {kind === "need" && <Field label="必要人数"><Input type="number" min={0} max={10000} step={1} value={required} onChange={(event) => setRequired(event.target.value)} required className="h-12" /></Field>}
          <Field label="情報の確度">
            <select className="field" value={certainty} onChange={(event) => setCertainty(event.target.value)}>
              <option>未確認</option>
              <option>予定</option>
              <option>確定</option>
            </select>
          </Field>
          {kind === "note" && (
            <Field label="人員対応">
              <select className="field" value={flag} onChange={(event) => setFlag(event.target.value)}>
                <option>指定なし</option>
                <option>退場予定</option>
                <option>書類未提出</option>
                <option>入場前</option>
                <option>対応完了</option>
              </select>
            </Field>
          )}
          <Field label="編集者"><Input value={user?.name || ""} readOnly className="h-12" /></Field>
          <Field label="確認日"><Input type="date" value={check} onChange={(event) => setCheck(event.target.value)} required className="h-12" /></Field>
          <div className="sm:col-span-2"><Field label="根拠・確認方法"><Input value={ref} onChange={(event) => setRef(event.target.value)} required maxLength={160} placeholder="例　11月出面／朝礼／B21" className="h-12" /></Field></div>
          <div className="sm:col-span-2"><Field label="次回対応"><Input value={next} onChange={(event) => setNext(event.target.value)} maxLength={130} className="h-12" /></Field></div>
          <div className="sm:col-span-2"><Field label="メモ"><Textarea value={memo} onChange={(event) => setMemo(event.target.value)} maxLength={240} rows={2} /></Field></div>
          {message && <p className="sm:col-span-2 text-sm font-bold text-[#ffb067]">{message}</p>}
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" disabled={saving} className="h-12 flex-1 bg-[#ff6a00] text-base font-black text-black hover:bg-[#ff8a1f]">{saving ? "保存中…" : "全員の台帳に保存"}</Button>
            <Button type="button" variant="outline" className="h-12" onClick={() => onOpenChange(false)}>閉じる</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Label className="grid gap-1.5 text-sm text-neutral-300">
      {label}
      {children}
    </Label>
  );
}
