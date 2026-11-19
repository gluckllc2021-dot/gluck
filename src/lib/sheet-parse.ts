/** 月次出面スプレッドシート（タブ＝現場、列＝作業員、行＝日付）を台帳行へ変換する。書き込みはしない。 */

export type SheetGrid = { title: string; rows: string[][] };
export type Workbook = { spreadsheetId: string; title: string; sheets: SheetGrid[] };

export type TabMapping = {
  tab: string;
  projectName: string;
  region: string;
  include: boolean;
  discovered?: boolean;
};

export type DayMark = {
  status: "blank" | "attend" | "move";
  /** 数値の人工。文字出勤（3時間・残業2）は null */
  value: number | null;
  raw: string;
};

export type ParsedWorker = {
  name: string;
  group: boolean;
  parenIssue: boolean;
  days: Record<string, DayMark>;
  sheetTotal: number | null;
  unitPrice: number | null;
};

export type SheetAlert = {
  level: "alert" | "info";
  code: string;
  tab: string;
  project: string;
  message: string;
};

export type ParsedProject = {
  tab: string;
  projectName: string;
  region: string;
  include: boolean;
  discovered: boolean;
  dayCap: number;
  workers: ParsedWorker[];
  alerts: SheetAlert[];
};

export type ParseResult = {
  month: string;
  projects: ParsedProject[];
  alerts: SheetAlert[];
  /** 月をまたぐ締め（佐々木など）の、当月以外の日 */
  extraMonths: { month: string; project: ParsedProject; workers: ParsedWorker[] }[];
};

export const DEFAULT_TAB_MAP: Record<string, { projectName: string; region: string }> = {
  "ツカサ・フェリー": { projectName: "ツカサ・フェリー", region: "大阪" },
  "ルミック・平野": { projectName: "ルミック・平野", region: "大阪" },
  "ルミック・ラピダス": { projectName: "ラピダス・北海道", region: "北海道" },
  "北深電設・北海道": { projectName: "北深電設・北海道", region: "北海道" },
  "北深電設・神奈川": { projectName: "北深電設+神奈川", region: "神奈川" },
  "ルミック・青森": { projectName: "ルミック・六ヶ所", region: "青森" },
  "三電社/青森": { projectName: "三電社・青森", region: "青森" },
  "高宮/青森": { projectName: "高宮　青森", region: "青森" },
  "花菱・愛媛": { projectName: "花菱・愛媛", region: "愛媛" },
  "レックス": { projectName: "レックス枚方案件", region: "地域未確認" },
  恒栄通建: { projectName: "恒栄通建", region: "地域未確認" },
};

export function monthFromTitle(title: string) {
  const matched = title.match(/(\d{4})\s*年\s*(\d{1,2})\s*月/);
  if (!matched) return null;
  return `${matched[1]}-${matched[2].padStart(2, "0")}`;
}

export function spreadsheetIdFromUrl(input: string) {
  const text = input.trim();
  const matched = text.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (matched) return matched[1];
  if (/^[a-zA-Z0-9-_]{20,}$/.test(text) || text.startsWith("mock-")) return text;
  return null;
}

function iso(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function daysInMonth(ym: string) {
  const [year, month] = ym.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function personKey(name: string) {
  return name.normalize("NFKC").replace(/\s+/g, "");
}

function isGroupHeader(name: string) {
  return /電設|電気|工業|興業|一括/.test(name);
}

function parenIssue(name: string) {
  const open = (name.match(/[（(]/g) || []).length;
  const close = (name.match(/[）)]/g) || []).length;
  return open !== close;
}

function periodOf(tab: string, year: number) {
  const matched = tab.match(/(\d{1,2})\/(\d{1,2})\s*[～~ー\-]\s*(\d{1,2})\/(\d{1,2})/);
  if (!matched) return null;
  const startMonth = Number(matched[1]);
  const startDay = Number(matched[2]);
  const endMonth = Number(matched[3]);
  const endDay = Number(matched[4]);
  const endYear = endMonth < startMonth ? year + 1 : year;
  return { start: iso(year, startMonth, startDay), end: iso(endYear, endMonth, endDay) };
}

type WorkerCol = { index: number; name: string; overtime?: number; group: boolean };

function workerColumns(header: string[]): WorkerCol[] {
  let end = header.length;
  for (let index = 1; index < header.length; index++) {
    const label = header[index].trim();
    if (label.startsWith("合計") || label === "車両") {
      end = index;
      break;
    }
  }
  let names = 0;
  let paired = 0;
  for (let index = 1; index < end; index++) {
    const label = header[index].trim();
    if (!label || label === "残業") continue;
    names++;
    if (index + 1 < end && !header[index + 1].trim()) paired++;
  }
  const pairMode = names >= 3 && paired >= names * 0.6;
  const columns: WorkerCol[] = [];
  if (pairMode) {
    let index = 1;
    while (index < end) {
      const label = header[index].trim();
      if (!label) {
        index++;
        continue;
      }
      const overtime = index + 1 < end && !header[index + 1].trim() ? index + 1 : undefined;
      columns.push({ index, name: label, overtime, group: isGroupHeader(label) });
      index += overtime ? 2 : 1;
      while (index < end && !header[index].trim()) index++;
    }
    return columns;
  }
  for (let index = 1; index < end; index++) {
    const label = header[index].trim();
    if (!label || label === "残業" || label === "車両") continue;
    columns.push({ index, name: label, group: isGroupHeader(label) });
  }
  return columns;
}

function readMark(raw: string): { mark?: DayMark; skip?: boolean; error?: string } {
  const text = raw.trim();
  if (!text) return { mark: { status: "blank", value: null, raw: "" } };
  if (/^移動/.test(text)) return { mark: { status: "move", value: null, raw: text } };
  if (/^\d{1,2}[:：]\d{2}$/.test(text)) return { skip: true };
  if (/時間|残業/.test(text)) return { mark: { status: "attend", value: null, raw: text } };
  const numeric = Number(text.replace(/,/g, ""));
  if (Number.isFinite(numeric) && numeric > 0) return { mark: { status: "attend", value: numeric, raw: text } };
  if (numeric === 0) return { mark: { status: "blank", value: null, raw: text } };
  return { error: `読めないセル「${text.slice(0, 24)}」` };
}

function parseDate(value: string) {
  const matched = value.trim().match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})$/);
  if (!matched) return null;
  return iso(Number(matched[1]), Number(matched[2]), Number(matched[3]));
}

function numberAt(row: string[] | undefined, index: number) {
  const text = row?.[index]?.trim() ?? "";
  if (!text || !/^-?\d+(?:\.\d+)?$/.test(text)) return null;
  return Number(text);
}

export function parseWorkbook(book: Workbook, mappings: TabMapping[], asOf: string): ParseResult {
  const sheetMonth = monthFromTitle(book.title) || asOf.slice(0, 7);
  const year = Number(sheetMonth.slice(0, 4));
  const saved = new Map(mappings.map((item) => [item.tab, item]));
  const projects: ParsedProject[] = [];
  const extraMonths: ParseResult["extraMonths"] = [];
  const alerts: SheetAlert[] = [];

  for (const sheet of book.sheets) {
    const tab = sheet.title.trim();
    if (tab === "ひな形" || tab.startsWith("ひな形")) {
      alerts.push({ level: "info", code: "skip", tab, project: "", message: "ひな形タブは取り込みません。" });
      continue;
    }
    const period = periodOf(tab, year);
    if (period && period.end.slice(0, 7) < sheetMonth) {
      alerts.push({ level: "info", code: "previous-period", tab, project: "", message: `${tab} は前の締め期間なので、この月の集計から外します。` });
      continue;
    }
    const known = DEFAULT_TAB_MAP[tab] || (tab.startsWith("佐々木") ? { projectName: "佐々木電業", region: "地域未確認" } : null);
    const mapping = saved.get(tab);
    const discovered = !mapping && !known;
    const include = mapping ? mapping.include : !discovered;
    const projectName = mapping?.projectName || known?.projectName || tab;
    const region = mapping?.region || known?.region || "地域未確認";
    if (!include) {
      projects.push({ tab, projectName, region, include: false, discovered: true, dayCap: daysInMonth(sheetMonth), workers: [], alerts: [] });
      alerts.push({ level: "info", code: "candidate", tab, project: projectName, message: `新しいタブ「${tab}」はまだ取り込んでいません。対応表で案件名を確認してください。` });
      continue;
    }

    const rows = sheet.rows;
    const headerIndex = rows.findIndex((row) => row[0]?.trim() === "出勤");
    if (headerIndex < 0) {
      alerts.push({ level: "alert", code: "no-header", tab, project: projectName, message: "出勤の見出し行がないため、このタブは取り込んでいません。" });
      continue;
    }
    const header = rows[headerIndex];
    const columns = workerColumns(header);
    const body: string[][] = [];
    for (const row of rows.slice(headerIndex + 1)) {
      const label = row[0]?.trim() || "";
      if (label.startsWith("出面合計") || label.startsWith("高速")) break;
      body.push(row);
    }
    const totalRow = rows.slice(headerIndex + 1).find((row) => row[0]?.trim().startsWith("出面合計"));
    const priceRow = rows.slice(headerIndex + 1).find((row) => /元請単価|元請請求単価/.test(row[0]?.trim() || ""));
    const totalHeader = header.findIndex((cell) => cell.trim().startsWith("合計（人工）") || cell.trim() === "合計" || cell.trim() === "合計（人工）");
    let shownTotal = totalHeader >= 0 ? numberAt(totalRow, totalHeader) : null;
    if (header[totalHeader]?.trim().startsWith("合計（人工）") && (shownTotal === 0 || shownTotal === null) && numberAt(totalRow, totalHeader + 1) !== null) {
      shownTotal = numberAt(totalRow, totalHeader + 1);
      alerts.push({ level: "info", code: "shift", tab, project: projectName, message: "合計（人工）の値が1列右にずれているため、右隣の数字を使いました。" });
    }

    const cap = period && period.end.slice(0, 7) === sheetMonth ? Number(period.end.slice(-2)) : daysInMonth(sheetMonth);
    const workers: ParsedWorker[] = columns.map((column) => ({
      name: column.name,
      group: column.group,
      parenIssue: parenIssue(column.name),
      days: {},
      sheetTotal: numberAt(totalRow, column.index),
      unitPrice: numberAt(priceRow, column.index),
    }));
    const localAlerts: SheetAlert[] = [];

    for (const row of body) {
      const day = parseDate(row[0] || "");
      if (!day) continue;
      if (period && (day < period.start || day > period.end)) continue;
      columns.forEach((column, workerIndex) => {
        const main = readMark(row[column.index] || "");
        const side = column.overtime !== undefined ? readMark(row[column.overtime] || "") : null;
        if (main.error) {
          localAlerts.push({ level: "alert", code: "unreadable", tab, project: projectName, message: `${column.name} ${day} ${main.error} このセルは取り込んでいません。` });
        }
        let mark = main.mark;
        if (side?.mark?.status === "move") mark = { status: "move", value: null, raw: side.mark.raw };
        else if (side?.error) {
          localAlerts.push({ level: "alert", code: "unreadable", tab, project: projectName, message: `${column.name}の残業列 ${day} ${side.error}` });
        }
        if (!mark || mark.status === "blank") return;
        workers[workerIndex].days[day] = mark;
      });
    }

    for (const worker of workers) {
      if (worker.parenIssue) {
        localAlerts.push({ level: "alert", code: "paren", tab, project: projectName, message: `「${worker.name}」は括弧が閉じていません。氏名はそのまま取り込み、要確認にしています。` });
      }
      const worked = Object.values(worker.days).some((mark) => mark.status === "attend");
      if (worked && (worker.unitPrice === null || worker.unitPrice === 0)) {
        localAlerts.push({ level: "alert", code: "no-price", tab, project: projectName, message: `${worker.name} は出面があるのに元請単価が空です。` });
      }
    }
    const prices = workers.map((worker) => worker.unitPrice).filter((price): price is number => price !== null && price > 0);
    for (let index = 1; index < prices.length; index++) {
      if (prices[index] === prices[index - 1] + 1) {
        localAlerts.push({ level: "alert", code: "price-step", tab, project: projectName, message: `元請単価が1円ずつ増えています（${prices[index - 1]} → ${prices[index]}）。オートフィルの記入ミスの可能性があります。` });
        break;
      }
    }
    const personSum = workers.reduce((sum, worker) => sum + (worker.sheetTotal || 0), 0);
    if (shownTotal !== null && Math.abs(personSum - shownTotal) > 0.05) {
      localAlerts.push({
        level: "alert",
        code: "sum-mismatch",
        tab,
        project: projectName,
        message: `出面合計の表示 ${shownTotal} と、個人列の合計 ${personSum} が合いません。SUMの範囲がずれている可能性があります。`,
      });
    }
    const asOfMarks = workers.some((worker) => worker.days[asOf]?.status === "attend" || worker.days[asOf]?.status === "move");
    const hasAny = workers.some((worker) => Object.keys(worker.days).length > 0);
    if (hasAny && !asOfMarks && asOf.slice(0, 7) === sheetMonth && (!period || (asOf >= period.start && asOf <= period.end))) {
      localAlerts.push({ level: "alert", code: "unfilled", tab, project: projectName, message: `${asOf} は出勤の記入がありません。未入力の現場として確認してください。` });
    }

    const split = new Map<string, ParsedWorker[]>();
    for (const worker of workers) {
      const byMonth = new Map<string, ParsedWorker>();
      for (const [day, mark] of Object.entries(worker.days)) {
        const month = day.slice(0, 7);
        if (!byMonth.has(month)) {
          byMonth.set(month, { ...worker, days: {}, sheetTotal: month === sheetMonth ? worker.sheetTotal : null, unitPrice: worker.unitPrice });
        }
        byMonth.get(month)!.days[day] = mark;
      }
      if (byMonth.size === 0) byMonth.set(sheetMonth, { ...worker, days: {} });
      for (const [month, part] of byMonth) {
        if (!split.has(month)) split.set(month, []);
        split.get(month)!.push(part);
      }
    }
    const primaryWorkers = split.get(sheetMonth) || workers.map((worker) => ({ ...worker, days: {} }));
    projects.push({ tab, projectName, region, include: true, discovered, dayCap: cap, workers: primaryWorkers, alerts: localAlerts });
    alerts.push(...localAlerts);
    for (const [month, monthWorkers] of split) {
      if (month === sheetMonth) continue;
      extraMonths.push({
        month,
        project: { tab, projectName, region, include: true, discovered, dayCap: daysInMonth(month + "-01"), workers: monthWorkers, alerts: [] },
        workers: monthWorkers,
      });
    }
  }

  const byPerson = new Map<string, Map<string, Set<string>>>();
  for (const project of projects) {
    if (!project.include) continue;
    for (const worker of project.workers) {
      if (worker.group) continue;
      for (const [day, mark] of Object.entries(worker.days)) {
        if (mark.status !== "attend") continue;
        const key = personKey(worker.name);
        if (!byPerson.has(key)) byPerson.set(key, new Map());
        const days = byPerson.get(key)!;
        if (!days.has(day)) days.set(day, new Set());
        days.get(day)!.add(project.projectName);
      }
    }
  }
  for (const [key, days] of byPerson) {
    const hits = [...days.entries()].filter(([, names]) => names.size >= 2);
    if (!hits.length) continue;
    const sites = new Set<string>();
    for (const [, names] of hits) for (const name of names) sites.add(name);
    alerts.push({
      level: "alert",
      code: "double",
      tab: "",
      project: [...sites].join("・"),
      message: `${key} さんが ${hits.length}日、${[...sites].join(" と ")} の両方で出勤になっています。`,
    });
  }

  return { month: sheetMonth, projects, alerts, extraMonths };
}
