import assert from "node:assert/strict";
import test from "node:test";
import { getAccessToken, setAccessToken, subscribeAccessToken } from "./accessTokenStore";

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
