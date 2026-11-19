import { core, contactText, type Ledger, type ReviewEvent } from "./attendance";
import { todayJST } from "./utils";

export const STATUSES = ["未入力", "出勤", "休み", "欠勤", "休暇", "移動", "未確認", "当日対象外", "名簿外"] as const;
export const CERTAINTIES = ["未確認", "予定", "確定"] as const;
export const FLAGS = ["指定なし", "退場予定", "書類未提出", "入場前", "対応完了"] as const;

export type Draft = {
  t: string;
  pi: number;
  key: string;
  day: string;
  n: string;
  actual: number;
  c: string;
  check: string;
  ref: string;
  next: string;
  memo: string;
  value: number | null;
  s?: string;
  co?: string;
  g?: boolean;
  flag?: string;
};

function same(left: ReviewEvent, right: ReviewEvent) {
  const keys = Object.keys(right) as (keyof ReviewEvent)[];
  return keys.every((key) => key === "id" || key === "at" || key === "before" || key === "after" || key === "actor" || left[key] === right[key]);
}

export function validateDraft(draft: Draft, ledger: Ledger, events: ReviewEvent[], today = todayJST()) {
  const t = draft.t;
  if (!["src", "detail", "note", "need"].includes(t)) return { ok: false as const, error: "登録する内容を選択してください。" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.day) || !/^\d{4}-\d{2}-\d{2}$/.test(draft.check)) {
    return { ok: false as const, error: "日付の形式を確認してください。" };
  }
  if (!ledger.p[draft.pi]) return { ok: false as const, error: "対象案件を選択してください。" };
  if (!draft.ref.trim()) return { ok: false as const, error: "根拠・確認方法を入力してください。" };
  if (draft.ref.trim().length > 160) return { ok: false as const, error: "根拠は160文字以内にしてください。" };
  if ((draft.next || "").length > 130 || (draft.memo || "").length > 240) {
    return { ok: false as const, error: "次回対応とメモの長さを確認してください。" };
  }
  if (draft.check > today) return { ok: false as const, error: "確認日には今日以前の日付を入力してください。" };
  const name = draft.n.trim();
  if (t !== "need" && !name) return { ok: false as const, error: "名前・根拠・確認者を入力してください。" };
  if (t !== "need" && name.length > 55) return { ok: false as const, error: "作業員名は55文字以内にしてください。" };
  if (["src", "detail"].includes(t)) {
    if (!draft.s || !STATUSES.includes(draft.s as (typeof STATUSES)[number])) {
      return { ok: false as const, error: "勤務状況を選択してください。" };
    }
    if (!CERTAINTIES.includes(draft.c as (typeof CERTAINTIES)[number])) {
      return { ok: false as const, error: "確度を選択してください。" };
    }
    if (["未入力", "未確認"].includes(draft.s) && draft.c !== "未確認") {
      return { ok: false as const, error: "未入力・未確認の記録は確度を未確認にしてください。" };
    }
    if (t === "src" && draft.s === "名簿外" && draft.c !== "確定") {
      return { ok: false as const, error: "原本の対象日名簿から外れていることを確認して登録してください。" };
    }
    if (draft.day > today && t === "src" && draft.c === "確定" && ["出勤", "欠勤", "休み", "休暇"].includes(draft.s)) {
      return { ok: false as const, error: "未来日の勤務は予定で登録してください。" };
    }
  }
  if (t === "note" && !FLAGS.includes((draft.flag || "指定なし") as (typeof FLAGS)[number])) {
    return { ok: false as const, error: "人員対応を選択してください。" };
  }
  if (t === "need" && (!CERTAINTIES.includes(draft.c as (typeof CERTAINTIES)[number]) || draft.c === "")) {
    return { ok: false as const, error: "確度を選択してください。" };
  }
  let value = draft.value;
  if (t === "need") {
    if (value === null || !Number.isInteger(value) || value < 0 || value > 10000) {
      return { ok: false as const, error: "必要人数は0以上の整数にしてください。" };
    }
  } else if (["src", "detail"].includes(t) && draft.s === "出勤" && value !== null) {
    if (!Number.isFinite(value) || value < 0) return { ok: false as const, error: "人数・人工には0以上の数値を入力してください。" };
    value = Math.round(value * 100) / 100;
  } else {
    value = null;
  }
  const key = t === "need" ? "" : draft.key || `u|${draft.pi}|${name}`;
  if (t !== "need" && !draft.key) {
    const snap = core(ledger, events, draft.day);
    const dup = snap.rows.some((row) => row.pi === draft.pi && row.n === name);
    if (dup) return { ok: false as const, error: "同じ表記の名簿行があります。照合する名簿行を選んでください。" };
  }
  const event: ReviewEvent = {
    id: "",
    at: "",
    t,
    pi: draft.pi,
    key,
    day: draft.day,
    n: t === "need" ? "" : name,
    actual: Number.isInteger(draft.actual) ? draft.actual : draft.pi,
    c: draft.c,
    who: "",
    check: draft.check,
    ref: draft.ref.trim(),
    next: (draft.next || "").trim(),
    memo: (draft.memo || "").trim(),
    value,
  };
  if (["src", "detail"].includes(t)) {
    event.s = draft.s;
    event.co = (draft.co || "").trim().slice(0, 55);
    event.g = !!draft.g;
  }
  if (t === "note") event.flag = draft.flag || "指定なし";
  const last = [...events].reverse().find((item) => item.key === event.key && item.t === event.t && item.day === event.day && item.pi === event.pi);
  if (last && same(last, event)) return { ok: false as const, error: "同じ確認内容が既に保存されています。" };
  return { ok: true as const, event };
}

export function withActor(event: ReviewEvent, user: { id: string; name: string; role: string }, ledger: Ledger, events: ReviewEvent[]) {
  const snap = core(ledger, events, event.day);
  let before = "未登録";
  if (event.t === "need") {
    const need = snap.needs.get(event.pi);
    before = need ? `${need.value}人（${need.c}）` : "未登録";
  } else if (event.t === "note") {
    const row = snap.rows.find((item) => item.key === event.key);
    before = row?.flag?.flag || "指定なし";
  } else {
    const row = snap.rows.find((item) => item.key === event.key);
    const cell = event.t === "detail" ? row?.b : row?.a;
    before = cell ? contactText(cell) : "未登録";
  }
  let after = event.s || event.flag || "";
  if (event.t === "need") after = `${event.value}人（${event.c}）`;
  else if (event.t === "note") after = event.flag || "指定なし";
  else after = `${event.s} · ${event.c}`;
  return {
    ...event,
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    who: user.name,
    actor: { id: user.id, name: user.name, role: user.role },
    before: { label: before },
    after: { label: after },
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function parseStateImport(input: unknown): { ok: true; ledger: Ledger; events: ReviewEvent[] } | { ok: false; error: string } {
  const root = asRecord(input);
  if (!root) return { ok: false, error: "JSONオブジェクトを選んでください。" };
  const nested = asRecord(root.privateContent);
  const ledgerRaw = asRecord(root.ledger) || asRecord(nested?.ledger) || (Array.isArray(root.r) ? root : null);
  if (!ledgerRaw) return { ok: false, error: "台帳（ledger）が見つかりません。現行の state JSON を選んでください。" };
  if (ledgerRaw.v !== 1) return { ok: false, error: "対応している台帳バージョンは v1 です。" };
  if (typeof ledgerRaw.as !== "string" || typeof ledgerRaw.ds !== "string") {
    return { ok: false, error: "照合日（as, ds）がありません。" };
  }
  if (!Array.isArray(ledgerRaw.p) || !Array.isArray(ledgerRaw.r) || !Array.isArray(ledgerRaw.val)) {
    return { ok: false, error: "案件・名簿・記号表の配列がありません。" };
  }
  const projects = ledgerRaw.p.map((item) => {
    const p = Array.isArray(item) ? item : [];
    return [String(p[0] ?? ""), String(p[1] ?? "地域未確認"), p[2] ?? "", String(p[3] ?? ""), Number(p[4] ?? 31)];
  });
  const rows = ledgerRaw.r.map((item, index) => {
    if (!Array.isArray(item)) throw new Error(`${index + 1}行目の名簿が配列ではありません。`);
    const pi = Number(item[0]);
    if (!Number.isInteger(pi) || pi < 0 || pi >= projects.length) {
      throw new Error(`${index + 1}行目の案件番号が範囲外です。`);
    }
    return [
      pi,
      String(item[1] ?? ""),
      String(item[2] ?? ""),
      Number(item[3] ?? 0) ? 1 : 0,
      String(item[4] ?? ""),
      String(item[5] ?? ""),
      String(item[6] ?? ""),
      String(item[7] ?? ""),
    ];
  });
  let eventsRaw: unknown[] = [];
  if (Array.isArray(root.events)) eventsRaw = root.events;
  else if (Array.isArray(nested?.events)) eventsRaw = nested.events;
  const events: ReviewEvent[] = [];
  const ids = new Set<string>();
  for (const item of eventsRaw) {
    const event = asRecord(item);
    if (!event || typeof event.id !== "string" || typeof event.t !== "string" || typeof event.day !== "string") {
      return { ok: false, error: "訂正履歴に id・種別・日付のない行があります。" };
    }
    if (ids.has(event.id)) return { ok: false, error: "訂正履歴の id が重複しています。" };
    ids.add(event.id);
    events.push(event as unknown as ReviewEvent);
  }
  try {
    const ledger: Ledger = {
      v: 1,
      as: String(ledgerRaw.as),
      ds: String(ledgerRaw.ds),
      r: rows,
      val: ledgerRaw.val.map((item) => String(item ?? "")),
      p: projects,
      people: Array.isArray(ledgerRaw.people) ? (ledgerRaw.people as unknown[][]) : [],
      plan: Array.isArray(ledgerRaw.plan) ? (ledgerRaw.plan as unknown[][]) : [],
      hist: Array.isArray(ledgerRaw.hist) ? ledgerRaw.hist : [],
      src: typeof ledgerRaw.src === "string" ? ledgerRaw.src : undefined,
      dst: typeof ledgerRaw.dst === "string" ? ledgerRaw.dst : undefined,
      meta: asRecord(ledgerRaw.meta) ? (ledgerRaw.meta as Ledger["meta"]) : undefined,
    };
    return { ok: true, ledger, events };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "台帳を読めませんでした。" };
  }
}
