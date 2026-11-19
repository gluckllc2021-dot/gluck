import { listUsers } from "./db";
import { registerUser } from "./auth";
import { initialAdminPlan } from "./initial-admin-plan";

export async function ensureInitialAdmin() {
  const plan = initialAdminPlan(
    { email: process.env.INITIAL_ADMIN_EMAIL, password: process.env.INITIAL_ADMIN_PASSWORD },
    (await listUsers()).length,
  );
  if (plan.action === "invalid") {
    console.warn(plan.reason);
    return plan.action;
  }
  if (plan.action !== "create") return plan.action;
  await registerUser({
    email: plan.email,
    name: "管理者",
    password: process.env.INITIAL_ADMIN_PASSWORD || "",
    role: "admin",
  });
  console.log("初期管理者を作成しました", plan.email);
  return "created" as const;
}
