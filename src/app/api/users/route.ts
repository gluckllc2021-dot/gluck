import { NextResponse } from "next/server";
import { listUsers, deleteUser, findUserById } from "@/lib/db";
import { changeUser, registerUser, type SessionUser } from "@/lib/auth";
import { guard } from "@/lib/guard";
import type { Role } from "@/lib/db";

function publicUser(user: { id: string; email: string; name: string; role: string }) {
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

export async function GET(req: Request) {
  const auth = await guard(req, "admin");
  if ("error" in auth && auth.error) return auth.error;
  return NextResponse.json({ users: listUsers().map(publicUser) });
}

export async function POST(req: Request) {
  const auth = await guard(req, "admin");
  if ("error" in auth && auth.error) return auth.error;
  const body = (await req.json().catch(() => null)) as { email?: string; name?: string; password?: string; role?: Role } | null;
  if (!body?.email || !body.name || !body.password || !body.role) {
    return NextResponse.json({ error: "氏名、メール、パスワード、権限を入力してください。" }, { status: 400 });
  }
  try {
    const user = await registerUser(body as { email: string; name: string; password: string; role: Role });
    return NextResponse.json({ user });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "登録できませんでした。" }, { status: 400 });
  }
}

export async function PATCH(req: Request) {
  const auth = await guard(req, "admin");
  if ("error" in auth && auth.error) return auth.error;
  const body = (await req.json().catch(() => null)) as { id?: string; name?: string; role?: Role; password?: string } | null;
  if (!body?.id) return NextResponse.json({ error: "対象の利用者がありません。" }, { status: 400 });
  const users = listUsers();
  const target = users.find((user) => user.id === body.id);
  if (!target) return NextResponse.json({ error: "利用者が見つかりません。" }, { status: 404 });
  if (body.role && body.role !== "admin" && target.role === "admin" && users.filter((user) => user.role === "admin").length <= 1) {
    return NextResponse.json({ error: "最後の管理者は権限を変更できません。" }, { status: 400 });
  }
  try {
    await changeUser(body.id, { name: body.name, role: body.role, password: body.password || undefined });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "更新できませんでした。" }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  const auth = await guard(req, "admin");
  if ("error" in auth && auth.error) return auth.error;
  const id = new URL(req.url).searchParams.get("id") || "";
  const actor = auth.user as SessionUser;
  if (!id || id === actor.id) return NextResponse.json({ error: "自分自身は削除できません。" }, { status: 400 });
  const target = findUserById(id);
  if (!target) return NextResponse.json({ error: "利用者が見つかりません。" }, { status: 404 });
  if (target.role === "admin" && listUsers().filter((user) => user.role === "admin").length <= 1) {
    return NextResponse.json({ error: "最後の管理者は削除できません。" }, { status: 400 });
  }
  deleteUser(id);
  return NextResponse.json({ ok: true });
}
