import { NextResponse } from "next/server";
import { clearSession, currentUser } from "@/lib/auth";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  return NextResponse.json({ user });
}

export async function POST() {
  await clearSession();
  return NextResponse.json({ ok: true });
}
