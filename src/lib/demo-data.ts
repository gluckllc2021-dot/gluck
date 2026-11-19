import type { Ledger, ReviewEvent } from "./attendance";

const FAMILIES = ["青木", "黒田", "白石", "緑川", "紺野", "橘", "桜井", "星野", "相沢", "神谷", "水野", "野口", "安藤", "内田", "川口", "望月", "片山", "大西", "小野", "堀", "菊地", "杉山", "岩崎", "上野", "宮崎", "高木", "安田", "河野", "竹内", "中野", "今井", "大塚", "菅原", "久保", "西田", "東", "北村", "新井", "松崎", "浜田"];
const GIVENS = ["蓮", "陽菜", "湊", "紬", "陽向", "結月", "蒼", "凛", "大翔", "美月", "海斗", "咲良", "樹", "杏", "碧", "律", "楓", "心春", "陽太", "琴音"];
const COMPANIES = ["グリュック", "北海興業", "浪速設備", "青葉工業", "瀬戸建設", "東港土木"];

export type DemoSite = {
  name: string;
  region: string;
  code: string;
  manager: string;
  need: number;
  /** 当日の勤務をこの順で割り当てる */
  today: string[];
};

/** 画面確認用。実在の作業員名は使わない。現場名はデザイン確認用のダミー。 */
export const DEMO_SITES: DemoSite[] = [
  {
    name: "横浜資材ヤード",
    region: "神奈川",
    code: "GLK-001",
    manager: "佐藤 健一",
    need: 22,
    today: repeat("出勤", 16).concat(repeat("休み", 3), repeat("欠勤", 1)),
  },
  {
    name: "古小牧新工場建設工事",
    region: "北海道",
    code: "GLK-002",
    manager: "田中 大輔",
    need: 20,
    today: repeat("出勤", 18).concat(repeat("休み", 2)),
  },
  {
    name: "大阪物流センター",
    region: "大阪",
    code: "GLK-003",
    manager: "山本 剛志",
    need: 16,
    today: repeat("出勤", 16).concat(repeat("休み", 2), ["欠勤"]),
  },
  {
    name: "今治架設工事",
    region: "愛媛",
    code: "GLK-004",
    manager: "中村 裕二",
    need: 11,
    today: repeat("出勤", 11).concat(["休暇"]),
  },
  {
    name: "八戸港湾改良工事",
    region: "青森",
    code: "GLK-005",
    manager: "伊藤 直樹",
    need: 14,
    today: repeat("出勤", 10).concat(repeat("休み", 2), ["欠勤"], repeat("未入力", 3)),
  },
  {
    name: "川崎プラント整備工事",
    region: "神奈川",
    code: "GLK-006",
    manager: "渡辺 智也",
    need: 18,
    today: repeat("出勤", 14).concat(repeat("休み", 2), ["欠勤"], ["未入力"], ["移動"]),
  },
];

function repeat(value: string, count: number) {
  return Array.from({ length: count }, () => value);
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function statusChar(status: string, index: number) {
  if (status === "出勤") return index % 5 === 0 ? "H" : index % 7 === 0 ? "D" : "B";
  if (status === "休み") return "E";
  if (status === "欠勤") return "F";
  if (status === "休暇") return "G";
  if (status === "移動") return "C";
  return "A";
}

function personName(index: number) {
  const family = FAMILIES[index % FAMILIES.length];
  const given = GIVENS[Math.floor(index / FAMILIES.length) % GIVENS.length];
  return `${family} ${given}`;
}

export function buildDemo(): { ledger: Ledger; events: ReviewEvent[] } {
  const rng = mulberry32(20261119);
  const rows: unknown[][] = [];
  let nameIndex = 0;
  const corrections: { key: string; pi: number; name: string; company: string }[] = [];

  DEMO_SITES.forEach((site, pi) => {
    site.today.forEach((status, index) => {
      const name = personName(nameIndex);
      const company = COMPANIES[(nameIndex + pi) % COMPANIES.length];
      nameIndex++;
      let marks = "";
      for (let day = 1; day <= 19; day++) {
        if (day === 19) {
          marks += statusChar(status, index);
          continue;
        }
        const dow = new Date(Date.UTC(2026, 10, day)).getUTCDay();
        if (dow === 0 || dow === 6) {
          marks += "E";
          continue;
        }
        const x = rng();
        marks += x < 0.84 ? "B" : x < 0.92 ? "E" : x < 0.96 ? "F" : x < 0.98 ? "C" : "D";
      }
      const diff = pi === 3 && index < 2 ? "19=A" : "";
      rows.push([pi, name, company, 0, marks, diff, "1".repeat(30), "1".repeat(19)]);
      if (pi === 2 && index === 0) {
        corrections.push({ key: "b" + (rows.length - 1), pi, name, company });
      }
    });
  });

  rows.push([5, "東港土木（一括）", "東港土木", 1, "H".repeat(19), "", "1".repeat(30), "1".repeat(19)]);

  const ledger: Ledger = {
    v: 1,
    as: "2026-11-19",
    ds: "2026-11-18",
    val: ["", "1", "移動", "残業2", "休み", "欠勤", "休暇", "2"],
    p: DEMO_SITES.map((site) => [site.name, site.region, "", "", 30]),
    r: rows,
    people: [
      [1, "新人 ダミー", "入場候補", "2026-11-25", "", "書類待ち", "2026-11-18"],
      [4, "応援 ダミー", "配置予定", "2026-11-20", "2026-11-28", "未提出", "2026-11-17"],
    ],
    plan: DEMO_SITES.map((site, pi) => [pi, site.need, "11月配置"]),
    hist: [],
    meta: {
      projects: DEMO_SITES.map((site) => ({ code: site.code, manager: site.manager, sheetTab: site.name })),
      sheet: { title: "2026年11月　出面" },
    },
  };

  const events: ReviewEvent[] = DEMO_SITES.map((site, pi) => ({
    id: `need-${pi}`,
    at: "2026-11-19T00:30:00.000Z",
    t: "need",
    pi,
    key: "",
    day: "2026-11-19",
    n: "",
    actual: pi,
    c: "確定",
    who: "田中 主任",
    check: "2026-11-19",
    ref: "朝礼の必要人数",
    next: "",
    memo: "",
    value: site.need,
    before: { label: "未登録" },
    after: { label: `${site.need}人` },
    actor: { name: "田中 主任", role: "editor" },
  }));

  // 掛け持ち。出勤は現場ごとに足し、同日2現場の警告は1人のまま出す。
  const twin = [
    [0, 20],
    [1, 21],
  ] as const;
  for (const [source, target] of twin) {
    const row = ledger.r[target];
    const from = ledger.r[source];
    if (row && from) row[1] = from[1];
  }

  const corrected = corrections[0];
  if (corrected) {
    events.push({
      id: "src-demo-1",
      at: "2026-11-19T00:45:00.000Z",
      t: "src",
      pi: corrected.pi,
      key: corrected.key,
      day: "2026-11-19",
      n: corrected.name,
      actual: corrected.pi,
      c: "確定",
      who: "田中 主任",
      check: "2026-11-19",
      ref: "朝礼点呼 / 現場事務所",
      next: "",
      memo: "点呼で出勤を確認",
      value: 1,
      s: "出勤",
      co: corrected.company,
      g: false,
      before: { label: "チェックなし · 未確認" },
      after: { label: "出勤 · 確定" },
      actor: { name: "田中 主任", role: "editor" },
    });
    const row = ledger.r[Number(corrected.key.slice(1))];
    if (row) {
      const marks = String(row[4]);
      row[4] = marks.slice(0, 18) + "A";
    }
  }

  events.push({
    id: "note-demo-1",
    at: "2026-11-19T01:00:00.000Z",
    t: "note",
    pi: 0,
    key: "b1",
    day: "2026-11-19",
    n: String(ledger.r[1]?.[1] ?? ""),
    actual: 0,
    c: "予定",
    who: "田中 主任",
    check: "2026-11-19",
    ref: "協力会社からの連絡",
    next: "資格証の写しを回収",
    memo: "入場書類が一部未提出",
    value: null,
    flag: "書類未提出",
    before: { label: "指定なし" },
    after: { label: "書類未提出" },
    actor: { name: "田中 主任", role: "editor" },
  });

  return { ledger, events };
}
