import { NextResponse } from "next/server";
import { replaceLedger } from "@/lib/db";
import { guard } from "@/lib/guard";
import { parseStateImport } from "@/lib/review";
import { parseSheetCsv } from "@/lib/sheet-csv";

export async function POST(req: Request) {
  const auth = await guard(req, "admin");
  if ("error" in auth && auth.error) return auth.error;
  const body = (await req.json().catch(() => null)) as {
    text?: string;
    replaceEvents?: boolean;
    asOf?: string;
  } | null;
  if (!body?.text || body.text.length > 8_000_000) {
    return NextResponse.json({ error: "ファイルが空か、大きすぎます。" }, { status: 400 });
  }
  const trimmed = body.text.replace(/^\uFEFF/, "").trim();
  let parsed: ReturnType<typeof parseStateImport>;
  try {
    parsed = trimmed.startsWith("{") || trimmed.startsWith("[") ? parseStateImport(JSON.parse(trimmed)) : parseSheetCsv(trimmed, body.asOf);
  } catch {
    return NextResponse.json({ error: "ファイルを読み取れませんでした。JSONまたはCSVを選んでください。" }, { status: 400 });
  }
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const replaceEvents = body.replaceEvents === true || (body.replaceEvents !== false && parsed.events.length > 0);
  replaceLedger(parsed.ledger, replaceEvents ? parsed.events : null);
  return NextResponse.json({
    ok: true,
    projects: parsed.ledger.p.length,
    rows: parsed.ledger.r.length,
    events: replaceEvents ? parsed.events.length : 0,
    as: parsed.ledger.as,
  });
}
