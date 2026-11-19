import { NextResponse } from "next/server";
import { buildActivityReport } from "@/lib/activity";
import { projectName } from "@/lib/attendance";
import { getLedgerForDate, listEvents, listMonthLedgers } from "@/lib/db";
import { guard } from "@/lib/guard";
import { todayJST } from "@/lib/utils";

export async function GET(req: Request) {
  const auth = await guard(req);
  if ("error" in auth && auth.error) return auth.error;
  const url = new URL(req.url);
  const date = url.searchParams.get("date") || todayJST();
  const region = url.searchParams.get("region") || "";
  const project = url.searchParams.get("project") || "";
  const year = date.slice(0, 4);
  const ledgers = listMonthLedgers(year);
  const current = getLedgerForDate(date);
  let projectNameFilter = "";
  if (project && current) {
    const index = Number(project);
    if (Number.isInteger(index) && current.p[index]) projectNameFilter = projectName(current, index);
  }
  const report = buildActivityReport(ledgers, listEvents(), date, {
    region: region || undefined,
    projectName: projectNameFilter || undefined,
  });
  return NextResponse.json(report);
}
