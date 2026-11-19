import { NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { addSheetFromUrl, publicSheets, syncAll } from "@/lib/sheet-sync";
import { saveSheets, setSyncIntervalMinutes, listSheets } from "@/lib/db";
import type { TabMapping } from "@/lib/sheet-parse";

export async function GET(req: Request) {
  const auth = await guard(req, "admin");
  if ("error" in auth && auth.error) return auth.error;
  return NextResponse.json(publicSheets());
}

export async function POST(req: Request) {
  const auth = await guard(req, "admin");
  if ("error" in auth && auth.error) return auth.error;
  const body = (await req.json().catch(() => null)) as { url?: string; month?: string } | null;
  if (!body?.url) return NextResponse.json({ error: "スプレッドシートのURLを貼り付けてください。" }, { status: 400 });
  try {
    addSheetFromUrl(body.url, body.month || "");
    await syncAll(true);
    return NextResponse.json(publicSheets());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "登録できませんでした。" }, { status: 400 });
  }
}

export async function PATCH(req: Request) {
  const auth = await guard(req, "admin");
  if ("error" in auth && auth.error) return auth.error;
  const body = (await req.json().catch(() => null)) as {
    intervalMinutes?: number;
    sheetId?: string;
    mappings?: TabMapping[];
  } | null;
  if (body?.intervalMinutes) setSyncIntervalMinutes(Math.min(120, Math.max(1, Math.round(body.intervalMinutes))));
  if (body?.sheetId && body.mappings) {
    const sheets = listSheets();
    const sheet = sheets.find((item) => item.id === body.sheetId);
    if (!sheet) return NextResponse.json({ error: "シートが見つかりません。" }, { status: 404 });
    sheet.mappings = body.mappings;
    saveSheets(sheets);
  }
  return NextResponse.json(publicSheets());
}

export async function DELETE(req: Request) {
  const auth = await guard(req, "admin");
  if ("error" in auth && auth.error) return auth.error;
  const id = new URL(req.url).searchParams.get("id");
  saveSheets(listSheets().filter((sheet) => sheet.id !== id));
  return NextResponse.json(publicSheets());
}
