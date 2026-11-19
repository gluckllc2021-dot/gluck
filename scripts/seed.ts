import bcrypt from "bcryptjs";
import { writeFileSync, mkdirSync } from "fs";
import path from "path";
import { findUserByEmail, insertUser, listSheets, listUsers, setMeta } from "../src/lib/db";
import { buildDemo } from "../src/lib/demo-data";
import { addSheetFromUrl, syncAll } from "../src/lib/sheet-sync";

const DEMO_PASSWORD = "Gluck-Demo-2026";
const users = [
  ["admin@gluck.example", "管理 太郎", "admin"],
  ["editor@gluck.example", "田中 主任", "editor"],
  ["viewer@gluck.example", "閲覧 花子", "viewer"],
] as const;

async function main() {
  const force = process.argv.includes("--force");
  for (const [email, name, role] of users) {
    if (!(await findUserByEmail(email))) {
      await insertUser({
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
  const existing = await listUsers();
  for (const month of ["2026-08", "2026-09", "2026-10", "2026-11"]) {
    if (!(await listSheets()).some((sheet) => sheet.spreadsheetId === `mock-${month}`)) {
      await addSheetFromUrl(`https://docs.google.com/spreadsheets/d/${`mock-${month}`}/edit`, month);
    }
  }
  if (force) {
    await setMeta("ledger", "null");
    await setMeta("ledger:2026-11", "null");
    await setMeta("ledger:2026-10", "null");
  }
  const synced = await syncAll(true);
  console.log("シートを同期しました", synced.message);
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
