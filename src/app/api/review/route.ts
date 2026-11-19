import { NextResponse } from "next/server";
import { getLedger, getRevision, listEvents, appendEvent } from "@/lib/db";
import { guard } from "@/lib/guard";
import { validateDraft, withActor, type Draft } from "@/lib/review";
import { todayJST } from "@/lib/utils";

export async function POST(req: Request) {
  const auth = await guard(req, "edit");
  if ("error" in auth && auth.error) return auth.error;
  const body = (await req.json().catch(() => null)) as { event?: Draft; previous?: string | null; sourceRevision?: number } | null;
  const ledger = getLedger();
  if (!ledger || !body?.event) return NextResponse.json({ error: "台帳がありません。" }, { status: 400 });
  const events = listEvents();
  const checked = validateDraft(body.event, ledger, events, todayJST());
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
  const event = withActor(checked.event, auth.user!, ledger, events);
  const saved = appendEvent(event, body.previous ?? null, Number(body.sourceRevision));
  if (!saved.ok) {
    return NextResponse.json(
      { error: "別の確認記録が追加されました。履歴を確認してから再度保存してください。" },
      { status: 409 },
    );
  }
  return NextResponse.json({ ok: true, sourceRevision: saved.revision ?? getRevision(), event });
}
