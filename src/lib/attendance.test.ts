import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { core, counted, isUnknown, missing, totalStats, type Ledger } from "./attendance";
import { headcount, siteStats } from "./aggregate";
import { buildDemo } from "./demo-data";

function ledger(): Ledger {
  return {
    v: 1,
    as: "2026-11-19",
    ds: "2026-11-18",
    val: ["", "1", "移動", "残業2", "休み", "欠勤", "有給", "0"],
    p: [
      ["北浜", "大阪", 0, "", 30],
      ["札幌", "北海道", 0, "", 30],
      ["小現場", "東京", 0, "", 30],
    ],
    r: [
      [0, "山田 太郎", "北海興業", 0, "B".repeat(19), "", "1".repeat(30), "1".repeat(19)],
      [1, "山田 太郎", "北海興業", 0, "B".repeat(19), "", "1".repeat(30), "1".repeat(19)],
      [0, "佐藤 花子", "浪速設備", 0, "E".repeat(19), "", "1".repeat(30), "1".repeat(19)],
      [0, "鈴木 一郎", "", 0, "A".repeat(19), "", "1".repeat(30), "1".repeat(19)],
      [0, "高橋 次郎", "青葉工業", 0, "B".repeat(19), "", "1".repeat(18) + "X" + "1".repeat(11), "1".repeat(19)],
      [0, "除外 四郎", "青葉工業", 0, "B".repeat(19), "", "1".repeat(18) + "0" + "1".repeat(11), "0".repeat(19)],
      [1, "伊藤 美咲", "瀬戸建設", 0, "B".repeat(19), "19=A", "1".repeat(30), "1".repeat(19)],
      [1, "青葉工業", "青葉工業", 1, "B".repeat(19), "", "1".repeat(30), "1".repeat(19)],
      [0, "渡辺 健", "自社", 0, "C".repeat(19), "", "1".repeat(30), "1".repeat(19)],
      [0, "中村 葵", "浪速設備", 0, "F".repeat(19), "", "1".repeat(30), "1".repeat(19)],
      [2, "小林 蓮", "瀬戸建設", 0, "B".repeat(19), "", "1".repeat(30), "1".repeat(19)],
      [2, "加藤 大輝", "瀬戸建設", 0, "B".repeat(19), "", "1".repeat(30), "1".repeat(19)],
    ],
    people: [],
    plan: [],
  };
}

describe("出面の判定", () => {
  const day = "2026-11-19";
  const { rows } = core(ledger(), [], day);
  const byName = (name: string) => rows.find((r) => r.n === name)!;

  it("数値の1は出勤、空欄はチェックなし、移動・休み・欠勤を読む", () => {
    assert.equal(byName("山田 太郎").a.s, "出勤");
    assert.equal(byName("山田 太郎").a.value, 1);
    assert.equal(byName("鈴木 一郎").a.s, "チェックなし");
    assert.equal(isUnknown(byName("鈴木 一郎").a), true);
    assert.equal(byName("佐藤 花子").a.s, "休み");
    assert.equal(byName("中村 葵").a.s, "欠勤");
    assert.equal(byName("渡辺 健").a.s, "移動");
  });

  it("マスクXは名簿外、マスク0は名簿から外す", () => {
    assert.equal(byName("高橋 次郎").a.s, "名簿外");
    assert.equal(byName("高橋 次郎").a.has, false);
    assert.equal(rows.some((r) => r.n === "除外 四郎"), false);
  });

  it("案件詳細の差分と会社一括を保持する", () => {
    const row = byName("伊藤 美咲");
    assert.equal(row.a.s, "出勤");
    assert.equal(row.b.s, "未入力");
    assert.ok(row.delta.includes("勤務差分"));
    assert.equal(byName("青葉工業").a.group, true);
  });

  it("同名は1人にまとめ、未確認があると不足は未確定", () => {
    const stats = totalStats(rows);
    assert.equal(stats.dup, true);
    assert.ok(stats.un > 0);
    const site = rows.filter((r) => r.pi === 0);
    const needs = new Map([[0, { c: "確定", value: 5 } as never]]);
    assert.equal(missing(site, needs, 0), null);
  });

  it("全員確定の現場は必要人数との差を返す", () => {
    const site = rows.filter((r) => r.pi === 2);
    const needs = new Map([[2, { c: "確定", value: 4 } as never]]);
    assert.equal(missing(site, needs, 2), 2);
    assert.equal(counted(site[0], "出勤"), true);
  });

  it("訂正イベントが台帳側を上書きし、原本は残る", () => {
    const base = ledger();
    const { rows: next } = core(base, [
      {
        id: "e1",
        at: "2026-11-19T00:00:00.000Z",
        t: "src",
        pi: 0,
        key: "b2",
        day,
        n: "佐藤 花子",
        actual: 0,
        c: "確定",
        who: "編集者",
        check: day,
        ref: "電話",
        next: "",
        memo: "",
        value: null,
        s: "出勤",
        co: "浪速設備",
        g: false,
      },
    ], day);
    const row = next.find((r) => r.key === "b2")!;
    assert.equal(row.a.s, "出勤");
    assert.equal(row.source.s, "休み");
    assert.ok(row.delta.includes("原本と台帳の訂正差"));
  });

  it("照合日より先は未確認になる", () => {
    const { rows: future } = core(ledger(), [], "2026-11-20");
    assert.equal(future[0].a.known, false);
    assert.equal(isUnknown(future[0].a), true);
  });
});

describe("デモ台帳の集計", () => {
  it("不足が出ている現場は2件で、区分の合計が全体人数と一致する", () => {
    const { ledger: data, events } = buildDemo();
    const snap = core(data, events, "2026-11-19");
    const sites = siteStats(data, snap.rows, snap.needs, {});
    const short = sites.filter((s) => (s.shortage ?? 0) > 0);
    assert.equal(short.length, 2);
    const head = headcount(snap.rows);
    assert.equal(head.attend + head.rest + head.absent + head.unknown + head.move + head.other, head.total);
    assert.ok(head.rows > head.total);
    assert.equal(head.doubleAttend, 2);
    assert.ok(head.attend > 0);
    assert.ok((head.rate ?? 0) > 0);
  });
});
