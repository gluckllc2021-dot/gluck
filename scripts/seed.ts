import bcrypt from "bcryptjs";
import { writeFileSync, mkdirSync } from "fs";
import path from "path";
import { insertUser, listUsers, replaceLedger, findUserByEmail } from "../src/lib/db";
import { buildDemo } from "../src/lib/demo-data";

const DEMO_PASSWORD = "Gluck-Demo-2026";
const users = [
  ["admin@gluck.example", "管理 太郎", "admin"],
  ["editor@gluck.example", "田中 主任", "editor"],
  ["viewer@gluck.example", "閲覧 花子", "viewer"],
] as const;

async function main() {
  const force = process.argv.includes("--force");
  for (const [email, name, role] of users) {
    if (!findUserByEmail(email)) {
      insertUser({
        id: crypto.randomUUID(),
        email,
        name,
        role,
        password_hash: await bcrypt.hash(DEMO_PASSWORD, 10),
        created_at: new Date().toISOString(),
      });
      console.log("作成", email, role);
    }
  }
  const { ledger, events } = buildDemo();
  const existing = listUsers();
  if (force || !process.env.SKIP_LEDGER) {
    const { getLedger } = await import("../src/lib/db");
    if (force || !getLedger()) {
      replaceLedger(ledger, events);
      console.log("デモ台帳を保存しました", ledger.p.length, "現場", ledger.r.length, "行");
    } else {
      console.log("台帳は既にあるためそのままにしました。置き換えるときは npm run seed -- --force");
    }
  }
  const sampleDir = path.join(process.cwd(), "samples");
  mkdirSync(sampleDir, { recursive: true });
  writeFileSync(path.join(sampleDir, "demo-state.json"), JSON.stringify({ ledger, events }, null, 2));
  console.log("利用者", existing.length, "人（既存を含む）");
  console.log("デモパスワード", DEMO_PASSWORD);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
