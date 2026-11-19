import bcrypt from "bcryptjs";
import { findUserByEmail, insertUser } from "../src/lib/db";
import type { Role } from "../src/lib/db";

function arg(name: string) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : "";
}

async function main() {
  const email = arg("email").trim().toLowerCase();
  const name = arg("name").trim();
  const password = arg("password");
  const role = (arg("role") || "admin") as Role;
  if (!email || !name || !password) {
    console.error("使い方: npm run user:create -- --email a@b.jp --name 山田 --password '10文字以上' --role admin");
    process.exit(1);
  }
  if (!["admin", "editor", "viewer"].includes(role)) {
    console.error("role は admin / editor / viewer です。");
    process.exit(1);
  }
  if (password.length < 10) {
    console.error("パスワードは10文字以上にしてください。");
    process.exit(1);
  }
  if (findUserByEmail(email)) {
    console.error("このメールアドレスは既にあります。");
    process.exit(1);
  }
  insertUser({
    id: crypto.randomUUID(),
    email,
    name,
    role,
    password_hash: await bcrypt.hash(password, 10),
    created_at: new Date().toISOString(),
  });
  console.log("作成しました", email, role);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
