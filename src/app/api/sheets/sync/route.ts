import { NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { publicSheets, syncAll } from "@/lib/sheet-sync";

export async function POST(req: Request) {
  const auth = await guard(req, "admin");
  if ("error" in auth && auth.error) return auth.error;
  await syncAll(true);
  return NextResponse.json(await publicSheets());
}
