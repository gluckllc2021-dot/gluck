/** 現行出面確認台帳の判定・集計。attendance.mjs の式をそのまま移植している。 */

export type Cell = {
  known: boolean;
  has: boolean | null;
  s: string;
  c: string;
  co: string;
  value: number | null;
  raw: string;
  group: boolean;
  p?: number;
  n?: string;
};

export type ReviewEvent = {
  id: string;
  at: string;
  t: string;
  pi: number;
  key: string;
  day: string;
  n: string;
  actual: number;
  c: string;
  who: string;
  check: string;
  ref: string;
  next: string;
  memo: string;
  value: number | null;
  s?: string;
  co?: string;
  g?: boolean;
  flag?: string;
  before?: { label?: string };
  after?: { label?: string };
  actor?: { name?: string; id?: string; role?: string };
};

export type Ledger = {
  v: number;
  as: string;
  ds: string;
  r: unknown[][];
  val: string[];
  p: unknown[][];
  people: unknown[][];
  plan: unknown[][];
  hist?: unknown[];
  src?: string;
  dst?: string;
  meta?: {
    /** 将来のスプレッドシート取込用。タブ名と案件の対応だけを持つ */
    sheet?: { title?: string; tabs?: { title: string; projectIndex: number; gid?: string | number }[] };
    projects?: { code?: string; manager?: string; sheetTab?: string }[];
  };
};

export type CoreRow = {
  key: string;
  pi: number;
  n: string;
  a: Cell;
  b: Cell;
  source: Cell;
  origin: unknown[] | null;
  notes: ReviewEvent[];
  work: number[];
  miss: number[];
  leave: number[];
  total: number;
  delta: string[];
  flag?: ReviewEvent;
};

export function core(data: Ledger, events: ReviewEvent[], day: string) {
  const inMonth = day.slice(0, 7) === data.as.slice(0, 7);
  const d = Number(day.slice(-2));
  const rows = new Map<string, CoreRow>();
  const nil = (): Cell => ({
    known: false,
    has: null,
    s: "未確認",
    c: "未確認",
    co: "",
    value: null,
    raw: "",
    group: false,
  });
  function decode(row: unknown[], dd: number, detail: boolean): Cell {
    const pi = Number(row[0]);
    const days = Number(data.p[pi]?.[4] ?? 0);
    if (
      !inMonth ||
      dd > days ||
      day.slice(0, 7) + "-" + String(dd).padStart(2, "0") > data.as
    ) {
      return nil();
    }
    const mask = String(row[6] ?? "");
    const detailMask = String(row[7] ?? "");
    if (!detail && mask[dd - 1] === "X") {
      return {
        ...nil(),
        known: true,
        has: false,
        s: "名簿外",
        c: "確定",
        p: pi,
        n: String(row[1] ?? ""),
      };
    }
    if (detail && row[7] && detailMask[dd - 1] !== "1") {
      return mask[dd - 1] === "1"
        ? {
            ...nil(),
            known: true,
            has: false,
            s: "名簿外",
            c: "確定",
            p: pi,
            n: String(row[1] ?? ""),
          }
        : nil();
    }
    if (!detail && row[6] && mask[dd - 1] !== "1") return nil();
    const marks = String(row[4] ?? "");
    let char = marks[dd - 1] || "A";
    const diff = String(row[5] ?? "");
    if (detail && diff === "-") return nil();
    if (detail && diff) {
      const found = diff.split(",").find((x) => x.startsWith(dd + "="));
      if (found) char = found.split("=")[1] ?? char;
    }
    const raw = String(data.val[char.charCodeAt(0) - 65] ?? "").trim();
    let s = detail ? "未入力" : "チェックなし";
    let value: number | null = null;
    if (raw) {
      if (/^(?:false|☐|□|0(?:\.0+)?)$/i.test(raw)) s = "休み";
      else if (/^(?:true|✓|✔|☑|○|〇|出勤)$/i.test(raw)) s = "出勤";
      else if (Number(raw) > 0) {
        s = "出勤";
        value = Number(raw);
      } else if (/時間|残業/.test(raw)) s = "出勤";
      else if (/欠勤/.test(raw)) s = "欠勤";
      else if (/休暇|有休|有給|公休/.test(raw)) s = "休暇";
      else if (/^(休|休み)$/.test(raw)) s = "休み";
      else s = raw === "移動" ? "移動" : "未確認";
    }
    return {
      known: true,
      has: true,
      s,
      c: ["チェックなし", "未入力", "未確認"].includes(s) ? "未確認" : "確定",
      co: detail ? "" : String(row[2] ?? ""),
      value,
      raw: !detail && !raw ? "チェックなし" : raw,
      group: !!row[3],
      p: pi,
      n: String(row[1] ?? ""),
    };
  }
  const baseKeys = new Set<string>();
  if (inMonth) {
    data.r.forEach((r, i) => {
      const key = "b" + i;
      baseKeys.add(key);
      const pi = Number(r[0]);
      const mask = String(r[6] ?? "");
      const detailMask = String(r[7] ?? "");
      if (d > Number(data.p[pi]?.[4] ?? 0) || (r[6] && mask[d - 1] === "0" && detailMask[d - 1] !== "1")) {
        return;
      }
      const decoded = decode(r, d, false);
      rows.set(key, {
        key,
        pi,
        n: String(r[1] ?? ""),
        a: decoded,
        b: decode(r, d, true),
        source: decoded,
        origin: r,
        notes: [],
        work: [],
        miss: [],
        leave: [],
        total: 0,
        delta: [],
      });
    });
  }
  const needs = new Map<number, ReviewEvent>();
  const flags = new Map<string, ReviewEvent>();
  const current = events.filter((e) => e.day === day);
  for (const e of current) {
    if (e.t === "need") {
      needs.set(e.pi, e);
      continue;
    }
    if (!rows.has(e.key)) {
      const previous = baseKeys.has(e.key) ? data.r[Number(e.key.slice(1))] : null;
      rows.set(e.key, {
        key: e.key,
        pi: e.pi,
        n: e.n,
        a: nil(),
        b: nil(),
        source: nil(),
        origin: previous ?? null,
        notes: [],
        work: [],
        miss: [],
        leave: [],
        total: 0,
        delta: [],
      });
    }
    const r = rows.get(e.key)!;
    if (e.t === "src" || e.t === "detail") {
      const a: Cell = {
        known: true,
        has: e.s !== "名簿外",
        s: e.s || "未確認",
        c: e.c,
        co: e.co || "",
        group: !!e.g,
        value: e.value,
        p: e.actual,
        n: e.n,
        raw: e.ref,
      };
      r[e.t === "src" ? "a" : "b"] = a;
      if (e.t === "src") {
        r.pi = e.actual;
        r.n = e.n;
      } else if (!r.a.known) {
        r.pi = e.actual;
        r.n = e.n;
      }
    }
    if (e.t === "note" && e.flag && e.flag !== "指定なし") flags.set(e.key, e);
    r.notes.push(e);
  }
  for (const r of rows.values()) {
    r.work = [];
    r.miss = [];
    r.leave = [];
    r.total = 0;
    r.delta = [];
    const base = r.origin;
    const recordDays = new Map<number, { s: string; c: string; value: number | null; p?: number; has?: boolean | null }>();
    if (base && inMonth) {
      for (let dd = 1; dd <= Math.min(d, Number(data.p[Number(base[0])]?.[4] ?? 0)); dd++) {
        recordDays.set(dd, decode(base, dd, false));
      }
    }
    for (const e of events) {
      if (e.t === "src" && e.key === r.key && e.day.slice(0, 7) === day.slice(0, 7) && e.day <= day) {
        recordDays.set(Number(e.day.slice(-2)), {
          s: e.s || "",
          c: e.c,
          value: e.value,
          p: e.actual,
          has: e.s !== "名簿外",
        });
      }
    }
    for (const [num, a] of [...recordDays].sort((x, y) => x[0] - y[0])) {
      if (a.has === false || a.p !== r.pi) continue;
      if (a.s === "休暇" && a.c !== "未確認") r.leave.push(num);
      if (a.c !== "確定") continue;
      if (a.s === "出勤") {
        r.work.push(num);
        if (Number.isFinite(a.value)) r.total += Number(a.value);
      }
      if (["欠勤", "休み", "休暇"].includes(a.s)) r.miss.push(num);
    }
    const a = r.source;
    const b = r.b;
    if (a.known && b.known) {
      if (a.has !== b.has) r.delta.push(a.has ? "追加" : "削除");
      if (a.has && b.has) {
        if (a.p !== b.p) r.delta.push("案件変更");
        if (a.co && b.co && a.co !== b.co) r.delta.push("所属変更");
        if (!(a.s === "チェックなし" && b.s === "未入力") && (a.s !== b.s || a.c !== b.c || a.value !== b.value)) {
          r.delta.push("勤務差分");
        }
        if (a.n !== b.n) r.delta.push("氏名差分");
      }
    } else if (a.known !== b.known) r.delta.push("比較未確認");
    if (
      r.notes.some((e) => e.t === "src") &&
      (r.a.s !== a.s || r.a.c !== a.c || r.a.co !== a.co || r.a.value !== a.value || r.a.p !== a.p || r.a.n !== a.n)
    ) {
      r.delta.push("原本と台帳の訂正差");
    }
    r.flag = flags.get(r.key);
  }
  return { rows: [...rows.values()], needs };
}

export function isUnknown(a: Cell) {
  return a.has !== false && (!a.known || a.c === "未確認" || ["チェックなし", "未入力", "未確認"].includes(a.s));
}

export function counted(row: CoreRow, status: string) {
  return !!(row.a.has && row.a.c === "確定" && row.a.s === status);
}

export function numberSeen(n: number, unsettled: boolean) {
  return n ? String(n) : unsettled ? "未確定" : "0";
}

export function totalStats(rows: CoreRow[]) {
  const people = new Map<string, CoreRow[]>();
  for (const row of rows) {
    if (row.a.has === false || row.a.group || (row.origin?.[3] && !row.a.known)) continue;
    const name = row.n.normalize("NFKC").replace(/\s+/g, "");
    if (!people.has(name)) people.set(name, []);
    people.get(name)!.push(row);
  }
  let count = 0,
    no = 0,
    off = 0,
    explicit = 0,
    pending = 0,
    dup = false;
  for (const list of people.values()) {
    const on = list.filter((r) => counted(r, "出勤"));
    if (on.length) {
      count++;
      if (on.length > 1) dup = true;
      continue;
    }
    if (list.some((r) => counted(r, "移動"))) continue;
    const marked = list.some((r) => counted(r, "欠勤"));
    const rest = list.some((r) => counted(r, "休み") || counted(r, "休暇"));
    if (marked || rest) {
      no++;
      if (marked) explicit++;
      else off++;
      continue;
    }
    if (list.some((r) => isUnknown(r.a) || r.a.c === "予定")) pending++;
  }
  return {
    count,
    no,
    off,
    explicit,
    pending,
    dup,
    group: rows.filter((r) => r.a.group && counted(r, "出勤")).length,
    un: rows.filter((r) => isUnknown(r.a)).length,
    blank: rows.filter((r) => r.a.s === "チェックなし").length,
  };
}

export function missing(rows: CoreRow[], needs: Map<number, ReviewEvent>, pi: number) {
  const e = needs.get(pi);
  const a = totalStats(rows);
  if (e?.c !== "確定" || a.un || a.group || a.dup || !rows.length || rows.some((r) => r.a.c === "予定")) return null;
  return Math.max(0, Number(e.value) - a.count);
}

export function contactText(a: { known: boolean; has: boolean | null; s: string; c: string }) {
  return a.known ? (a.has === false ? "名簿外" : `${a.s} · ${a.c}`) : "未確認";
}

export function projectName(data: Ledger, pi: number) {
  return String(data.p[pi]?.[0] ?? "案件不明");
}

export function projectRegion(data: Ledger, pi: number) {
  return String(data.p[pi]?.[1] ?? "地域未確認");
}

export function projectCode(data: Ledger, pi: number) {
  return data.meta?.projects?.[pi]?.code || `GLK-${String(pi + 1).padStart(3, "0")}`;
}

export function projectManager(data: Ledger, pi: number) {
  return data.meta?.projects?.[pi]?.manager || "—";
}

export function companyOf(row: CoreRow) {
  const co = (row.a.co || String(row.origin?.[2] ?? "")).trim();
  return co || "所属未確認";
}
