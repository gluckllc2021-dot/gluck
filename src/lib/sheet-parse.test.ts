import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { core } from "./attendance";
import { headcount } from "./aggregate";
import { mockNovemberWorkbook } from "./sheet-fixture";
import { ledgersFromWorkbook } from "./sheet-merge";
import { parseWorkbook } from "./sheet-parse";

const asOf = "2026-11-19";

describe("シートの読み取り", () => {
  const book = mockNovemberWorkbook();
  const parsed = parseWorkbook(book, [], asOf);

  it("ひな形と前の締め期間は取り込まない", () => {
    assert.equal(parsed.projects.some((project) => project.tab === "ひな形"), false);
    assert.equal(parsed.projects.some((project) => project.tab.startsWith("佐々木9/")), false);
    assert.ok(parsed.alerts.some((alert) => alert.code === "skip"));
    assert.ok(parsed.alerts.some((alert) => alert.code === "previous-period"));
  });

  it("タブ名をサイトの案件名に読み替える", () => {
    const names = parsed.projects.filter((project) => project.include).map((project) => project.projectName);
    assert.ok(names.includes("ラピダス・北海道"));
    assert.ok(names.includes("ルミック・六ヶ所"));
    assert.ok(names.includes("三電社・青森"));
    assert.ok(names.includes("高宮　青森"));
    assert.ok(names.includes("レックス枚方案件"));
    assert.ok(names.includes("佐々木電業"));
    assert.equal(names.includes("新規現場テスト"), false);
    assert.ok(parsed.alerts.some((alert) => alert.code === "candidate"));
  });

  it("移動・時間表記・グループ人工・列ずれ・括弧・合計ずれを判定する", () => {
    const codes = new Set(parsed.alerts.map((alert) => alert.code));
    assert.ok(codes.has("sum-mismatch"));
    assert.ok(codes.has("price-step"));
    assert.ok(codes.has("no-price"));
    assert.ok(codes.has("unreadable"));
    assert.ok(codes.has("paren"));
    assert.ok(codes.has("unfilled"));
    assert.ok(codes.has("double"));
    assert.ok(codes.has("shift"));
    const aomori = parsed.projects.find((project) => project.tab === "ルミック・青森")!;
    assert.equal(aomori.workers[0].days["2026-11-03"].status, "move");
    const hokkaido = parsed.projects.find((project) => project.tab === "北深電設・北海道")!;
    assert.equal(hokkaido.workers[0].days["2026-11-09"].status, "move");
    assert.equal(hokkaido.workers[0].days["2026-11-02"].value, 1);
    const rex = parsed.projects.find((project) => project.tab === "レックス")!;
    assert.equal(rex.workers[1].group, true);
    assert.equal(rex.workers[1].days["2026-11-03"].value, 3);
    const takamiya = parsed.projects.find((project) => project.tab === "高宮/青森")!;
    assert.equal(takamiya.workers[0].days["2026-11-11"].status, "attend");
    assert.equal(takamiya.workers[0].days["2026-11-11"].value, null);
    const sasaki = parsed.projects.find((project) => project.projectName === "佐々木電業")!;
    assert.equal(sasaki.dayCap, 20);
    assert.equal(sasaki.workers[0].days["2026-10-25"], undefined);
    assert.ok(parsed.extraMonths.some((extra) => extra.month === "2026-10"));
  });
});

describe("台帳への反映と手動訂正", () => {
  it("空欄は休みにせず、同期し直しても訂正を消さない", () => {
    const book = mockNovemberWorkbook();
    const first = ledgersFromWorkbook(book, [], asOf);
    const november = first.months.get("2026-11")!;
    const head = headcount(core(november, [], asOf).rows);
    assert.equal(head.rest, 0);
    const ferry = november.p.findIndex((project) => project[0] === "ツカサ・フェリー");
    const rowIndex = november.r.findIndex((row) => Number(row[0]) === ferry && String(row[1]).includes("青木"));
    const corrected = ledgersFromWorkbook(book, [], asOf, first.months, [
      {
        id: "hand-1",
        at: "2026-11-19T01:00:00.000Z",
        t: "src",
        pi: ferry,
        key: `b${rowIndex}`,
        day: asOf,
        n: String(november.r[rowIndex][1]),
        actual: ferry,
        c: "確定",
        who: "田中 主任",
        check: asOf,
        ref: "本人に電話",
        next: "",
        memo: "",
        value: null,
        s: "休み",
        co: "",
        g: false,
      },
    ]);
    const again = corrected.months.get("2026-11")!;
    const snap = core(again, corrected.events, asOf);
    const row = snap.rows.find((item) => item.n.includes("青木") && again.p[item.pi][0] === "ツカサ・フェリー")!;
    assert.equal(row.a.s, "休み");
    assert.equal(row.source.s === "休み", false);
    assert.ok(row.delta.includes("原本と台帳の訂正差"));
    assert.equal(corrected.events.length, 1);
    const people = headcount(snap.rows.filter((item) => item.a.group !== true));
    assert.ok(people.total >= 1);
  });

  it("レックスの会社一括は当日の人工を出勤に足す", () => {
    const book = mockNovemberWorkbook();
    const november = ledgersFromWorkbook(book, [], asOf).months.get("2026-11")!;
    const snap = core(november, [], "2026-11-03");
    const rexPi = november.p.findIndex((project) => project[0] === "レックス枚方案件");
    const rex = headcount(snap.rows.filter((row) => row.pi === rexPi));
    assert.equal(rex.attend, 4);
    assert.equal(rex.groupHours, 3);
    assert.equal(rex.groups, 1);
    const perSite = november.p.reduce((sum, _project, pi) => sum + headcount(snap.rows.filter((row) => row.pi === pi)).attend, 0);
    assert.equal(headcount(snap.rows).attend, perSite);
  });
});
