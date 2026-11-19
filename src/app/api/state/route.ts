import { NextResponse } from "next/server";
import { canEdit } from "@/lib/auth";
import { getLedgerForDate, getRevision, getSheetAlerts, getSyncState, listEvents, listMonthLedgers } from "@/lib/db";
import { guard } from "@/lib/guard";
import { syncAll } from "@/lib/sheet-sync";
import { todayJST } from "@/lib/utils";

export async function GET(req: Request) {
  const auth = await guard(req);
  if ("error" in auth && auth.error) return auth.error;
  const user = auth.user!;
  await syncAll(false);
  const date = new URL(req.url).searchParams.get("date") || todayJST();
  return NextResponse.json({
    ledger: await getLedgerForDate(date),
    months: await listMonthLedgers(date.slice(0, 4)),
    events: await listEvents(),
    canEdit: canEdit(user.role),
    role: user.role,
    userName: user.name,
    userId: user.id,
    sourceRevision: await getRevision(),
    sync: await getSyncState(),
    sheetAlerts: await getSheetAlerts(),
  });
}
