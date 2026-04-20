import assert from "node:assert/strict";
import test from "node:test";
import { getAccessToken, setAccessToken, subscribeAccessToken } from "./accessTokenStore";
import { shouldRefreshAccessToken } from "./tokenFreshness";

test("access token store notifies subscribers and supports unsubscribe", () => {
  setAccessToken(null);

  const seen: Array<string | null> = [];
  const unsubscribe = subscribeAccessToken((token) => {
    seen.push(token);
  });

  setAccessToken("token-1");
  setAccessToken(null);
  unsubscribe();
  setAccessToken("token-2");

  assert.deepEqual(seen, ["token-1", null]);
  assert.equal(getAccessToken(), "token-2");

  setAccessToken(null);
});

test("token freshness helper refreshes before expiry window", () => {
  const now = 1_000_000;
  assert.equal(shouldRefreshAccessToken(now + 120_000, now, 60_000), false);
  assert.equal(shouldRefreshAccessToken(now + 30_000, now, 60_000), true);
  assert.equal(shouldRefreshAccessToken(0, now, 60_000), true);
});
