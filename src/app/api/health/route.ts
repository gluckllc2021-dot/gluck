import { NextResponse } from "next/server";
import { tursoEnabled } from "@/lib/db";

export async function GET() {
  return NextResponse.json({ ok: true, store: tursoEnabled() ? "turso" : "sqlite" });
}
