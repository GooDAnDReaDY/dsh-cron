import test from "node:test";
import assert from "node:assert/strict";
import { bestEffort } from "../lib/best-effort.js";

test("bestEffort runs synchronous functions and returns result", () => {
  const result = bestEffort("sync-ok", () => 42);
  assert.equal(result, 42);
});

test("bestEffort catches synchronous errors and logs to debug without throwing", () => {
  let logged = null;
  const fakeLogger = {
    debug(msg, err) {
      logged = { msg, err };
    }
  };
  const result = bestEffort("sync-fail", () => {
    throw new Error("boom");
  }, fakeLogger);

  assert.equal(result, undefined);
  assert.ok(logged);
  assert.ok(logged.msg.includes("sync-fail"));
  assert.equal(logged.err.message, "boom");
});

test("bestEffort handles async promises", async () => {
  const result = await bestEffort("async-ok", async () => "done");
  assert.equal(result, "done");
});

test("bestEffort catches async rejections without throwing", async () => {
  let logged = null;
  const fakeLogger = {
    debug(msg, err) {
      logged = { msg, err };
    }
  };
  const result = await bestEffort("async-fail", async () => {
    throw new Error("async-boom");
  }, fakeLogger);

  assert.equal(result, undefined);
  assert.ok(logged);
  assert.ok(logged.msg.includes("async-fail"));
  assert.equal(logged.err.message, "async-boom");
});
