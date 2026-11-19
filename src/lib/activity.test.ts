import assert from "node:assert/strict";
import test from "node:test";
import { buildActivityReport, growth } from "./activity";
import type { Ledger } from "./attendance";

function ledger(month: string, rows: unknown[][], asDay: number): Ledger {
  const dim = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).getUTCDate();
  return {
    v: 1,
    as: `${month}-${String(Math.min(asDay, dim)).padStart(2, "0")}`,
    ds: `${month}-01`,
    r: rows,
    val: ["", "1", "0.5", "2"],
    p: [
      ["ツカサ", "大阪", "", "", dim],
      ["平野", "神奈川", "", "", dim],
    ],
    people: [],
    plan: [],
  };
}

test("名前の空白は1人にまとめ、会社一括は最大の人工を足す", () => {
  const marks = "B".repeat(5) + "A".repeat(26);
  const half = "C".repeat(2) + "A".repeat(29);
  const data = ledger("2026-11", [
    [0, "青木 蓮", "", 0, marks, "", "1".repeat(31), ""],
    [0, "青木　蓮", "", 0, half, "", "1".repeat(31), ""],
    [1, "青葉電設", "", 1, "D".repeat(3) + "A".repeat(28), "", "1".repeat(31), ""],
  ], 19);
  const report = buildActivityReport([{ month: "2026-11", ledger: data }], [], "2026-11-05");
  assert.equal(report.month.people, 1 + 2);
  assert.equal(report.month.hours, 5 + 1 + 6);
  assert.equal(report.sites.find((site) => site.key === "ツカサ")?.people, 1);
  assert.equal(report.sites.find((site) => site.key === "平野")?.people, 2);
  assert.equal(report.sites.find((site) => site.key === "平野")?.hours, 6);
});

test("2現場の人は月間稼働人数で2人、会社一括の3は3人", () => {
  const data = ledger("2026-11", [], 19);
  data.val = ["", "1", "3"];
  const ones = "1".repeat(31);
  const day = "B" + "A".repeat(30);
  data.r = [
    [0, "青木 蓮", "", 0, day, "", ones, ""],
    [1, "青木 蓮", "", 0, day, "", ones, ""],
    [1, "青葉電設", "", 1, "C" + "A".repeat(30), "", ones, ""],
  ];
  const report = buildActivityReport([{ month: "2026-11", ledger: data }], [], "2026-11-02");
  assert.equal(report.month.people, 2 + 3);
  assert.equal(report.sites.find((site) => site.key === "ツカサ")?.people, 1);
  assert.equal(report.sites.find((site) => site.key === "平野")?.people, 1 + 3);
  assert.equal(report.momFair.people.diff, null);
});

test("月途中は前月全体と前月同日を分け、年初の実人数は月をまたいで1人", () => {
  const october = ledger("2026-10", [
    [0, "青木 蓮", "", 0, "B".repeat(31), "", "1".repeat(31), ""],
    [0, "森 凪", "", 0, "A".repeat(19) + "B".repeat(12), "", "1".repeat(31), ""],
  ], 31);
  const november = ledger("2026-11", [
    [0, "青木 蓮", "", 0, "B".repeat(19) + "A".repeat(12), "", "1".repeat(31), ""],
    [1, "星野 樹", "", 0, "B".repeat(10) + "A".repeat(21), "", "1".repeat(31), ""],
  ], 19);
  const report = buildActivityReport(
    [
      { month: "2026-10", ledger: october },
      { month: "2026-11", ledger: november },
    ],
    [],
    "2026-11-19",
  );
  assert.equal(report.partial, true);
  assert.equal(report.month.people, 2);
  assert.equal(report.previousFull?.people, 2);
  assert.equal(report.previousSameDay?.people, 1);
  assert.equal(report.momFair.people.diff, 1);
  assert.equal(report.year.people, 3);
  assert.equal(report.series.at(0)?.label, "10月");
  assert.equal(report.series.at(-1)?.partial, true);
  assert.equal(report.regions.find((item) => item.region === "大阪")?.people, 1);
});

test("前月が0のときは率を出さない", () => {
  assert.deepEqual(growth(4, 0), { diff: 4, rate: null });
  assert.deepEqual(growth(3, 2), { diff: 1, rate: 50 });
  assert.deepEqual(growth(1, null), { diff: null, rate: null });
});
