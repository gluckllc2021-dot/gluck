import assert from "node:assert/strict";
import test from "node:test";
import { cronAuthorized } from "./cron-auth";

test("同期の秘密が一致したときだけ通す", () => {
  assert.equal(cronAuthorized("correct-horse", "correct-horse"), true);
  assert.equal(cronAuthorized("wrong", "correct-horse"), false);
  assert.equal(cronAuthorized("correct-hors", "correct-horse"), false);
  assert.equal(cronAuthorized(null, "correct-horse"), false);
  assert.equal(cronAuthorized("correct-horse", ""), false);
  assert.equal(cronAuthorized("correct-horse", undefined), false);
});
