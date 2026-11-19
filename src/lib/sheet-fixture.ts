import type { Workbook } from "./sheet-parse";

/** 実在の作業員名は使わない。列の並びと例外だけ、11月シートと同じにする。 */

function row(cells: string[]) {
  return cells;
}

export function mockNovemberWorkbook(): Workbook {
  return {
    spreadsheetId: "mock-2026-11",
    title: "2026年11月　出面",
    sheets: [
      templateTab(),
      simpleTab("ツカサ・フェリー", [
        { name: "青木 蓮", days: filled(1, 17, "1"), price: "" },
        { name: "黒田 陽菜", days: { ...filled(3, 16, "1"), 4: "1" } },
      ]),
      simpleTab("ルミック・平野", [
        { name: "青木 蓮", days: { 4: "1", 5: "1", 6: "1" } },
        { name: "星野 樹", days: filled(4, 10, "1") },
      ]),
      pairTextTab(),
      hokkaidoTab(),
      simpleTab("北深電設・神奈川", [{ name: "水野 海斗", days: filled(2, 19, "1") }]),
      simpleTab("ルミック・青森", [
        { name: "桜井 杏", days: { 3: "移動", 4: "1", 5: "1", 19: "1" } },
      ]),
      sandenshaTab(),
      takamiyaTab(),
      hanabishiTab(),
      rexTab(),
      periodTab("佐々木9/21～10/20", "2026.9.", 21, 5),
      sasakiCurrentTab(),
      simpleTab("恒栄通建", [{ name: "川口 律", days: filled(2, 19, "1") }]),
      simpleTab("新規現場テスト", [{ name: "野口 碧", days: { 2: "1" } }]),
    ],
  };
}

function filled(from: number, to: number, value: string) {
  const days: Record<number, string> = {};
  for (let day = from; day <= to; day++) days[day] = value;
  return days;
}

function templateTab() {
  const header = ["出勤", "", "", "", "", "合計"];
  const rows = [["元請名"], header];
  for (let day = 1; day <= 5; day++) rows.push([`2026.11.${day}`, "", "", "", "", "0"]);
  rows.push(["出面合計", "", "", "", "", "0"]);
  return { title: "ひな形", rows };
}

function simpleTab(title: string, people: { name: string; days: Record<number, string>; price?: string }[]) {
  const header = ["出勤", ...people.map((person) => person.name), "合計"];
  const rows = [["元請名"], header];
  for (let day = 1; day <= 19; day++) {
    const cells = people.map((person) => person.days[day] || "");
    const sum = cells.reduce((total, cell) => total + (Number(cell) || 0), 0);
    rows.push([`2026.11.${day}`, ...cells, String(sum)]);
  }
  const totals = people.map((person) => String(Object.values(person.days).reduce((total, cell) => total + (Number(cell) || 0), 0)));
  rows.push(["出面合計", ...totals, String(totals.reduce((total, cell) => total + Number(cell), 0))]);
  rows.push(["元請単価", ...people.map((person) => person.price ?? "25000"), ""]);
  rows.push(["高速 電車賃"]);
  rows.push(["2026.3.1", ...people.map(() => ""), "0"]);
  return { title, rows: rows.map(row) };
}

function pairTextTab() {
  const header = ["出勤", "相沢（太郎）", "", "神谷（花）", "", "合計"];
  const rows = [["元請名"], header];
  for (let day = 1; day <= 19; day++) {
    const overtime = day === 9 ? "残業　4時間" : "";
    rows.push([`2026.11.${day}`, "1", overtime, "1", "", "2"]);
  }
  rows.push(["出面合計", "12", "", "12", "", "24"]);
  rows.push(["元請単価", "32000", "", "28000", "", ""]);
  rows.push(["高速 電車賃"], ["2026.3.1", "", "", "", "", "0"]);
  return { title: "ルミック・ラピダス", rows };
}

function hokkaidoTab() {
  const people = ["青木 蓮", "黒田 陽菜", "星野 樹"];
  const header = ["出勤"];
  people.forEach((name, index) => {
    header.push(name, "");
    if (index === 0) header.push("");
  });
  const totalAt = header.length;
  header.push("合計（人工）", "", "合計（残業）", "車両", "", "", "", "", "", "合計");
  const rows = [["元請名"], header];
  for (let day = 1; day <= 19; day++) {
    const line = Array(header.length).fill("");
    line[0] = `2026.11.${day}`;
    people.forEach((_, index) => {
      const base = 1 + index * 2 + (index > 0 ? 1 : 0);
      if (day === 9) line[base + 1] = "移動";
      else if (day !== 1) line[base] = "1.0";
    });
    rows.push(line);
  }
  const totals = Array(header.length).fill("");
  totals[0] = "出面合計";
  people.forEach((_, index) => {
    const base = 1 + index * 2 + (index > 0 ? 1 : 0);
    totals[base] = "8";
    totals[base + 1] = "10";
  });
  totals[totalAt] = "0";
  totals[totalAt + 1] = "24";
  rows.push(totals);
  const prices = Array(header.length).fill("");
  prices[0] = "元請単価";
  people.forEach((_, index) => {
    const base = 1 + index * 2 + (index > 0 ? 1 : 0);
    prices[base] = String(28000 + index);
  });
  rows.push(prices);
  return { title: "北深電設・北海道", rows };
}

function sandenshaTab() {
  const header = ["出勤", "青木五十嵐）", "黒田（北村", "合計"];
  const rows = [["元請名"], header];
  for (let day = 1; day <= 19; day++) {
    const mark = day === 4 ? "残業２" : "1";
    rows.push([`2026.11.${day}`, mark, day === 6 ? "？？？" : "1", day === 6 ? "1" : "2"]);
  }
  rows.push(["出面合計", "7", "7", "14"], ["元請単価", "0", "28000", ""], ["高速 電車賃"], ["2026.2.1", "", "", "0"]);
  return { title: "三電社/青森", rows };
}

function takamiyaTab() {
  const header = ["出勤", "内田 湊", "望月 咲", "合計"];
  const rows = [["元請名"], header];
  for (let day = 1; day <= 6; day++) rows.push([`2026.11.${day}`, "1", "1", "2"]);
  rows.push(["2026.11.11", "3時間", "1", "1"], ["2026.11.13", "2時間", "1", "1"]);
  for (let day = 14; day <= 19; day++) rows.push([`2026.11.${day}`, "1", "1", "2"]);
  rows.push(["出面合計", "8", "9", "10"], ["元請単価", "24000", "24000", ""], ["高速 電車賃"], ["2026.2.1", "", "", "0"]);
  return { title: "高宮/青森", rows };
}

function hanabishiTab() {
  const header = ["出勤", "西田 楓", "", "残業", "", "合計"];
  const rows = [["元請名"], header];
  rows.push(["2026.11.5", "1", "", "2.5", "19：30", "3.5"]);
  for (let day = 6; day <= 19; day++) rows.push([`2026.11.${day}`, "1", "", "", "", "1"]);
  rows.push(["出面合計（人工）", "6", "", "2.5", "", "6"], ["元請請求単価(円)", "23500", "", "", "", ""], ["高速"], ["2026.2.1", "", "", "", "", "0"], ["出面合計", "", "", "", "", ""]);
  return { title: "花菱・愛媛", rows };
}

function rexTab() {
  const header = ["出勤", "片山 大翔", "青葉電設", "合計"];
  const rows = [["元請名"], header];
  for (let day = 2; day <= 19; day++) rows.push([`2026.11.${day}`, "1", day % 2 ? "3" : "2", String(1 + (day % 2 ? 3 : 2))]);
  rows.push(["出面合計（人工）", "5", "12", "17"], ["元請請求単価(円)", "", "26000", ""], ["高速"], ["2026.2.1", "", "", "0"]);
  return { title: "レックス", rows };
}

function periodTab(title: string, prefix: string, start: number, count: number) {
  const header = ["出勤", "大西 凛", "合計"];
  const rows = [["元請名"], header];
  for (let offset = 0; offset < count; offset++) rows.push([`${prefix}${start + offset}`, "1", "1"]);
  rows.push(["出面合計（人工）", String(count), String(count)]);
  return { title, rows };
}

function sasakiCurrentTab() {
  const header = ["出勤", "小野 碧", "合計"];
  const rows = [["元請名"], header];
  rows.push(["2026.10.25", "1", "1"]);
  for (let day = 1; day <= 19; day++) rows.push([`2026.11.${day}`, day === 3 ? "" : "1", day === 3 ? "0" : "1"]);
  rows.push(["出面合計（人工）", "20", "20"], ["元請請求単価(円)", "28000", ""], ["高速"], ["2026.2.1", "", "0"], ["出面合計", "99", "99"]);
  return { title: "佐々木10/21～11/20", rows };
}
