import assert from "node:assert/strict";
import test from "node:test";
import { normalizeManagerPassword, normalizeStaffLogin, resolveStaffLoginCandidates } from "./staffCredentials";

test("normalizeStaffLogin trims and lowercases", () => {
  assert.equal(normalizeStaffLogin("  Waiter.Main  "), "waiter.main");
});

test("resolveStaffLoginCandidates keeps original and normalized variants", () => {
  assert.deepEqual(resolveStaffLoginCandidates("  Waiter.Main  "), ["Waiter.Main", "waiter.main"]);
  assert.deepEqual(resolveStaffLoginCandidates(" waiter-main "), ["waiter-main"]);
  assert.deepEqual(resolveStaffLoginCandidates("   "), []);
});

test("normalizeManagerPassword trims accidental edge spaces", () => {
  assert.equal(normalizeManagerPassword("  pass-123  "), "pass-123");
});
