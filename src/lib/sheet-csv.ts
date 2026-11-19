import type { Ledger, ReviewEvent } from "./attendance";

/**
 * スプレッドシート「2026年11月　出面」の正規化モデル。
 * セルの生値は val 表 + 名簿行の日別記号に残し、判定は attendance.ts に一本化する。
 *
 * 行の並び（現行 state JSON と同じ）:
 * 0 案件index / 1 氏名 / 2 所属 / 3 グループ（1 は会社一括。数値の人工をその日の出勤に足す）
 * 4 日別記号（1日が index 0。文字コード A 起点で val を引く）
 * 5 案件詳細の上書き "19=A" または詳細なし "-"
 * 6 日別マスク 1=対象 0=対象外 X=名簿外
 * 7 案件詳細側マスク
 *
 * 記号の例外:
 * - 空欄はチェックなし（未入力扱い）
 * - 1 や数値は出勤。数値はそのまま人工
 * - 「3時間」「残業2」など時間・残業表記は出勤だが数値人工には足さない
 * - 「移動」は出勤にしない
 * - 会社一括行はセルの人工を出勤に足す。空欄は0で、未入力にはしない
 */

const SYMBOLS = ["", "1", "移動", "残業2", "休み", "欠勤", "休暇", "2", "3時間", "2時間", "3"];

function symbolIndex(table: string[], raw: string) {
  const found = table.indexOf(raw);
  if (found >= 0) return found;
  table.push(raw);
  return table.length - 1;
}

function cellCode(raw: string) {
  const text = raw.trim();
  if (!text || text === "チェックなし" || text === "未入力" || text === "未確認") return "";
  if (/^(?:true|✓|✔|☑|○|〇|出勤)$/i.test(text)) return "1";
  if (/^(?:false|☐|□|休|休み)$/i.test(text)) return "休み";
  if (/欠勤/.test(text)) return "欠勤";
  if (/休暇|有休|有給|公休/.test(text)) return "休暇";
  if (text === "移動") return "移動";
  if (text === "名簿外" || text === "X") return "X";
  return text;
}

export function parseSheetCsv(csv: string, asOf?: string): { ok: true; ledger: Ledger; events: ReviewEvent[] } | { ok: false; error: string } {
  const rows = parseCsv(csv).filter((row) => row.some((cell) => cell.trim()));
  if (rows.length < 2) return { ok: false, error: "CSVにヘッダーと名簿行が必要です。" };
  const header = rows[0].map((cell) => cell.trim());
  const dayCols: { index: number; day: number }[] = [];
  header.forEach((cell, index) => {
    const matched = cell.match(/^(?:d)?(\d{1,2})$/) || cell.match(/^\d{4}[-/]\d{1,2}[-/](\d{1,2})$/);
    if (!matched) return;
    const day = Number(matched[1]);
    if (day >= 1 && day <= 31) dayCols.push({ index, day });
  });
  if (!dayCols.length) return { ok: false, error: "日付の列（1〜31）が見つかりません。ヘッダーを 1,2,3… または YYYY-MM-DD にしてください。" };

  const col = (names: string[]) => header.findIndex((cell) => names.includes(cell.replace(/\s/g, "")));
  const projectCol = col(["案件", "現場", "現場名", "案件名"]);
  const regionCol = col(["地域"]);
  const nameCol = col(["作業員", "作業員名", "氏名", "名前"]);
  const companyCol = col(["所属", "所属会社", "会社"]);
  const unitCol = col(["単位", "区分"]);
  if (projectCol < 0 || nameCol < 0) return { ok: false, error: "「案件」と「作業員」の列が必要です。" };

  const month = (asOf || new Date().toISOString().slice(0, 10)).slice(0, 7);
  const [year, monthNum] = month.split("-").map(Number);
  const monthLast = `${month}-${String(new Date(Date.UTC(year, monthNum, 0)).getUTCDate()).padStart(2, "0")}`;
  const reconciled = asOf && /^\d{4}-\d{2}-\d{2}$/.test(asOf) ? asOf : monthLast;
  const projects: unknown[][] = [];
  const projectIndex = new Map<string, number>();
  const val = [...SYMBOLS];
  const roster: unknown[][] = [];

  for (const line of rows.slice(1)) {
    const projectName = (line[projectCol] || "").trim();
    const person = (line[nameCol] || "").trim();
    if (!projectName || !person) continue;
    const region = regionCol >= 0 ? (line[regionCol] || "").trim() || "地域未確認" : "地域未確認";
    const key = `${projectName}@@${region}`;
    if (!projectIndex.has(key)) {
      projectIndex.set(key, projects.length);
      projects.push([projectName, region, "", "", 31]);
    }
    const pi = projectIndex.get(key)!;
    const unit = unitCol >= 0 ? (line[unitCol] || "").trim() : "";
    const group = /会社|一括|グループ/.test(unit) ? 1 : 0;
    let marks = "";
    let mask = "";
    for (let day = 1; day <= 31; day++) {
      const found = dayCols.find((col) => col.day === day);
      const raw = found ? cellCode(line[found.index] || "") : "";
      if (raw === "X") {
        marks += "A";
        mask += "X";
        continue;
      }
      marks += String.fromCharCode(65 + symbolIndex(val, raw));
      mask += "1";
    }
    roster.push([pi, person, companyCol >= 0 ? (line[companyCol] || "").trim() : "", group, marks, "", mask, ""]);
  }
  if (!roster.length) return { ok: false, error: "取り込める名簿行がありません。" };

  const ledger: Ledger = {
    v: 1,
    as: reconciled,
    ds: reconciled,
    r: roster,
    val,
    p: projects,
    people: [],
    plan: [],
    hist: [],
    meta: {
      sheet: { title: "CSV取込", tabs: projects.map((project, index) => ({ title: String(project[0]), projectIndex: index })) },
      projects: projects.map((project) => ({ sheetTab: String(project[0]) })),
    },
  };
  return { ok: true, ledger, events: [] };
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const char = src[i];
    if (quoted) {
      if (char === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") cell += char;
  }
  row.push(cell);
  rows.push(row);
  return rows;
}
