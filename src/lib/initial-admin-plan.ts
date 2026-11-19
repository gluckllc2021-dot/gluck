export type AdminPlan =
  | { action: "skip" }
  | { action: "create"; email: string }
  | { action: "invalid"; reason: string };

/** 利用者が0人のときだけ、環境変数から管理者を作る計画。パスワードは戻り値に含めない。 */
export function initialAdminPlan(input: { email?: string; password?: string }, userCount: number): AdminPlan {
  const email = input.email?.trim().toLowerCase() || "";
  const password = input.password || "";
  if (!email && !password) return { action: "skip" };
  if (userCount > 0) return { action: "skip" };
  if (!email || !password) return { action: "invalid", reason: "初期管理者は、メールアドレスとパスワードの両方を設定してください。" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { action: "invalid", reason: "初期管理者のメールアドレスの形を確認してください。" };
  if (password.length < 10) return { action: "invalid", reason: "初期管理者のパスワードは10文字以上にしてください。" };
  return { action: "create", email };
}
