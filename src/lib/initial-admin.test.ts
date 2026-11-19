import assert from "node:assert/strict";
import test from "node:test";
import { initialAdminPlan } from "./initial-admin-plan";

test("利用者が0人でメールとパスワードがあるときだけ管理者を作る", () => {
  assert.deepEqual(initialAdminPlan({ email: "boss@example.jp", password: "long-enough-1" }, 0), {
    action: "create",
    email: "boss@example.jp",
  });
  assert.deepEqual(initialAdminPlan({ email: " Boss@Example.jp ", password: "long-enough-1" }, 0).action, "create");
  assert.equal((initialAdminPlan({ email: " Boss@Example.jp ", password: "long-enough-1" }, 0) as { email?: string }).email, "boss@example.jp");
});

test("すでに利用者がいる、または設定が足りないときは作らない", () => {
  assert.deepEqual(initialAdminPlan({ email: "boss@example.jp", password: "long-enough-1" }, 2), { action: "skip" });
  assert.deepEqual(initialAdminPlan({}, 0), { action: "skip" });
  assert.equal(initialAdminPlan({ email: "boss@example.jp" }, 0).action, "invalid");
  assert.equal(initialAdminPlan({ password: "long-enough-1" }, 0).action, "invalid");
  assert.equal(initialAdminPlan({ email: "boss@example.jp", password: "short" }, 0).action, "invalid");
  assert.equal(initialAdminPlan({ email: "not-an-email", password: "long-enough-1" }, 0).action, "invalid");
});
