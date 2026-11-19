import { NextResponse } from "next/server";
import { canEdit, currentUser, sameOrigin, type SessionUser } from "./auth";

export async function guard(req: Request, level?: "edit" | "admin") {
  if (req.method !== "GET" && !sameOrigin(req)) {
    return { error: NextResponse.json({ error: "受け付けられないリクエストです。" }, { status: 403 }) };
  }
  const user = await currentUser();
  if (!user) return { error: NextResponse.json({ error: "ログインが必要です。" }, { status: 401 }) };
  if (level === "edit" && !canEdit(user.role)) {
    return { error: NextResponse.json({ error: "編集権限が必要です。" }, { status: 403 }) };
  }
  if (level === "admin" && user.role !== "admin") {
    return { error: NextResponse.json({ error: "管理者権限が必要です。" }, { status: 403 }) };
  }
  return { user: user satisfies SessionUser };
}
