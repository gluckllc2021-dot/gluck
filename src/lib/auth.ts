import "server-only";
import { createHash, randomBytes } from "crypto";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { createSession, deleteSession, findUserByEmail, findUserById, insertUser, updateUser, userByToken, type Role, type UserRow } from "./db";

export type SessionUser = { id: string; email: string; name: string; role: Role };

const COOKIE = "gluck_session";
const WEEK = 60 * 60 * 24 * 14;

export function canEdit(role: Role) {
  return role === "admin" || role === "editor";
}

export function canAdmin(role: Role) {
  return role === "admin";
}

export function toSession(user: UserRow): SessionUser {
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function secureCookie() {
  if (process.env.COOKIE_SECURE === "1") return true;
  if (process.env.COOKIE_SECURE === "0") return false;
  return process.env.NODE_ENV === "production";
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function checkPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function establishSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  const expires = Date.now() + WEEK * 1000;
  await createSession(hashToken(token), userId, expires);
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookie(),
    path: "/",
    maxAge: WEEK,
  });
}

export async function clearSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await deleteSession(hashToken(token));
  jar.set(COOKIE, "", { httpOnly: true, sameSite: "lax", secure: secureCookie(), path: "/", maxAge: 0 });
}

export async function currentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  const user = await userByToken(hashToken(token));
  return user ? toSession(user) : null;
}

export async function requireUser() {
  const user = await currentUser();
  if (!user) {
    const error = new Error("ログインが必要です");
    (error as Error & { status?: number }).status = 401;
    throw error;
  }
  return user;
}

export async function loginWithPassword(email: string, password: string) {
  const user = await findUserByEmail(email.trim());
  const dummy = "$2a$10$abcdefghijklmnopqrstuu2bD5mI5Yh0m1rQ0Q0Q0Q0Q0Q0Q0Q0Q";
  const ok = await checkPassword(password, user?.password_hash || dummy);
  if (!user || !ok) return null;
  await establishSession(user.id);
  return toSession(user);
}

export async function registerUser(input: { email: string; name: string; password: string; role: Role }) {
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("メールアドレスの形式を確認してください。");
  if (input.name.trim().length < 1 || input.name.trim().length > 40) throw new Error("氏名は1〜40文字にしてください。");
  if (input.password.length < 10) throw new Error("パスワードは10文字以上にしてください。");
  if (!["admin", "editor", "viewer"].includes(input.role)) throw new Error("権限を選択してください。");
  if (await findUserByEmail(email)) throw new Error("このメールアドレスは既に登録されています。");
  const user: UserRow = {
    id: crypto.randomUUID(),
    email,
    name: input.name.trim(),
    role: input.role,
    password_hash: await hashPassword(input.password),
    created_at: new Date().toISOString(),
  };
  await insertUser(user);
  return toSession(user);
}

export async function changeUser(id: string, patch: { name?: string; role?: Role; password?: string }) {
  const current = await findUserById(id);
  if (!current) throw new Error("利用者が見つかりません。");
  await updateUser(id, {
    name: patch.name?.trim(),
    role: patch.role,
    password_hash: patch.password ? await hashPassword(patch.password) : undefined,
  });
}

const attempts = new Map<string, number[]>();

export function hitRateLimit(key: string, limit = 8, windowMs = 10 * 60 * 1000) {
  const now = Date.now();
  const recent = (attempts.get(key) ?? []).filter((time) => now - time < windowMs);
  recent.push(now);
  attempts.set(key, recent);
  return recent.length > limit;
}

export function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  const host = req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
