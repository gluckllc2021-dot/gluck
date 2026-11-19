import { NextResponse } from "next/server";
import { findUserByEmail, listUsers } from "@/lib/db";
import { hitRateLimit, loginWithPassword } from "@/lib/auth";

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (hitRateLimit(ip)) {
    return NextResponse.json({ error: "試行が多すぎます。しばらくしてから再度お試しください。" }, { status: 429 });
  }
  const body = (await req.json().catch(() => null)) as { email?: string; password?: string } | null;
  if (!body?.email || !body.password) {
    return NextResponse.json({ error: "メールアドレスとパスワードを入力してください。" }, { status: 400 });
  }
  if (!(await listUsers()).length) {
    return NextResponse.json({ error: "初期ユーザーが未作成です。サーバーで npm run user:create を実行してください。" }, { status: 503 });
  }
  const user = await loginWithPassword(body.email, body.password);
  if (!user) return NextResponse.json({ error: "メールアドレスまたはパスワードが違います。" }, { status: 401 });
  return NextResponse.json({ user });
}

export async function GET() {
  const users = await listUsers();
  return NextResponse.json({
    needsSetup: users.length === 0,
    demo: users.some((user) => user.email.endsWith("@gluck.example")),
    known: (await findUserByEmail("admin@gluck.example")) ? "admin@gluck.example" : "",
  });
}
