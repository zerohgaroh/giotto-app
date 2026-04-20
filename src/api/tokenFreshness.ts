export function shouldRefreshAccessToken(expiresAt: number, now: number, minTtlMs: number) {
  return !expiresAt || expiresAt - now <= minTtlMs;
}
