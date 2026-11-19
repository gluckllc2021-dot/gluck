import { NextResponse } from "next/server";
import { canEdit } from "@/lib/auth";
import { getLedger, getRevision, listEvents } from "@/lib/db";
import { guard } from "@/lib/guard";

export async function GET(req: Request) {
  const auth = await guard(req);
  if ("error" in auth && auth.error) return auth.error;
  const user = auth.user!;
  return NextResponse.json({
    ledger: getLedger(),
    events: listEvents(),
    canEdit: canEdit(user.role),
    role: user.role,
    userName: user.name,
    userId: user.id,
    sourceRevision: getRevision(),
  });
}
