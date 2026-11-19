import { NextResponse } from "next/server";
import { core, companyOf, projectCode, projectManager, projectName, projectRegion } from "@/lib/attendance";
import { inScope, matchStatus, siteStats, statusLabel } from "@/lib/aggregate";
import { getLedger, listEvents } from "@/lib/db";
import { guard } from "@/lib/guard";

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export async function GET(req: Request) {
  const auth = await guard(req);
  if ("error" in auth && auth.error) return auth.error;
  const ledger = await getLedger();
  if (!ledger) return NextResponse.json({ error: "台帳がありません。" }, { status: 404 });
  const url = new URL(req.url);
  const date = url.searchParams.get("date") || ledger.as;
  const scope = {
    region: url.searchParams.get("region") || "",
    project: url.searchParams.get("project") || "",
    company: url.searchParams.get("company") || "",
    q: url.searchParams.get("q") || "",
    status: url.searchParams.get("status") || "",
  };
  const kind = url.searchParams.get("kind") === "workers" ? "workers" : "sites";
  const snap = core(ledger, await listEvents(), date);
  const lines: (string | number)[][] = [];
  if (kind === "sites") {
    lines.push(["現場コード", "現場名", "地域", "担当者", "全体", "名簿行", "出勤", "休み", "欠勤", "未入力", "移動", "出勤率", "必要人数", "不足", "ステータス"]);
    for (const site of siteStats(ledger, snap.rows, snap.needs, scope)) {
      const label = statusLabel(site);
      lines.push([
        site.code,
        site.name,
        site.region,
        site.manager,
        site.head.total,
        site.head.rows,
        site.head.attend,
        site.head.rest,
        site.head.absent,
        site.head.unknown,
        site.head.move,
        site.head.rate === null ? "" : `${site.head.rate}%`,
        site.required ?? "",
        site.shortage ?? "",
        label.text,
      ]);
    }
  } else {
    lines.push(["日付", "現場コード", "現場名", "地域", "担当者", "作業員", "所属", "単位", "勤務状況", "確度", "人工", "原本", "案件詳細", "差分", "月労働日数", "月欠勤日数", "月累計人工", "2現場出勤"]);
    const people = new Map<string, number>();
    for (const row of snap.rows) {
      if (!inScope(ledger, row, scope, true) || !matchStatus(row, scope.status)) continue;
      const key = row.n.normalize("NFKC").replace(/\s+/g, "");
      people.set(key, (people.get(key) ?? 0) + (row.a.s === "出勤" && row.a.c === "確定" ? 1 : 0));
    }
    for (const row of snap.rows) {
      if (!inScope(ledger, row, scope, true) || !matchStatus(row, scope.status)) continue;
      const key = row.n.normalize("NFKC").replace(/\s+/g, "");
      lines.push([
        date,
        projectCode(ledger, row.pi),
        projectName(ledger, row.pi),
        projectRegion(ledger, row.pi),
        projectManager(ledger, row.pi),
        row.n,
        companyOf(row),
        row.a.group ? "会社一括" : "個人",
        row.a.s,
        row.a.c,
        row.a.value ?? "",
        row.source.s,
        row.b.s,
        row.delta.join("・"),
        row.work.length,
        row.miss.length,
        row.total,
        (people.get(key) ?? 0) > 1 ? "警告" : "",
      ]);
    }
  }
  const body = "\uFEFF" + lines.map((line) => line.map(csvEscape).join(",")).join("\r\n");
  const filename = encodeURIComponent(kind === "sites" ? `出面_現場別_${date}.csv` : `出面_作業員_${date}.csv`);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
    },
  });
}