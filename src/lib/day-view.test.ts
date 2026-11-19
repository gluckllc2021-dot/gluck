import assert from "node:assert/strict";
import test from "node:test";
import { isSparse, latestFilledDate, summarizeDay } from "./day-view";
import type { Ledger } from "./attendance";

function ledger(month: string, marks: string): Ledger {
  const dim = marks.length;
  return {
    v: 1,
    as: `${month}-${String(dim).padStart(2, "0")}`,
    ds: `${month}-01`,
    r: [[0, "青木 蓮", "", 0, marks, "", "1".repeat(dim), ""]],
    val: ["", "1"],
    p: [["ツカサ", "大阪", "", "", dim]],
    people: [],
    plan: [],
  };
}

test("未入力が多い日は前日の入力済みを選ぶ", () => {
  const data = ledger("2026-11", "B".repeat(18) + "A".repeat(2));
  const filled = summarizeDay(data, [], "2026-11-18");
  const empty = summarizeDay(data, [], "2026-11-19");
  assert.equal(isSparse(filled.head), false);
  assert.equal(filled.head.attend, 1);
  assert.equal(isSparse(empty.head), true);
  const prior = latestFilledDate([{ month: "2026-11", ledger: data }], [], "2026-11-19");
  assert.equal(prior, "2026-11-18");
});

test("入力が後から増えると、その日の人数が変わる", () => {
  const before = ledger("2026-11", "B".repeat(17) + "AAA");
  const after = ledger("2026-11", "B".repeat(18) + "AA");
  assert.equal(summarizeDay(before, [], "2026-11-18").head.attend, 0);
  assert.equal(summarizeDay(after, [], "2026-11-18").head.attend, 1);
});
