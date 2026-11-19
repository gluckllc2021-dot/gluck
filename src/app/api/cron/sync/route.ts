import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron-auth";
import { syncAll } from "@/lib/sheet-sync";

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret?.trim()) {
    return NextResponse.json({ error: "CRON_SECRET が未設定です。" }, { status: 503 });
  }
  const header = req.headers.get("x-cron-secret") || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!cronAuthorized(header, secret)) {
    return NextResponse.json({ error: "同期の確認に失敗しました。" }, { status: 401 });
  }
  const state = await syncAll(true);
  return NextResponse.json({ ok: state.ok, message: state.message, at: state.at, warningCount: state.warningCount });
}
