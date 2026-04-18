let accessTokenMemory: string | null = null;
const accessTokenListeners = new Set<(token: string | null) => void>();

function notifyAccessTokenListeners() {
  for (const listener of accessTokenListeners) {
    listener(accessTokenMemory);
  }
}

export function setAccessToken(token: string | null) {
  accessTokenMemory = token;
  notifyAccessTokenListeners();
}

export function getAccessToken() {
  return accessTokenMemory;
}

export function subscribeAccessToken(listener: (token: string | null) => void) {
  accessTokenListeners.add(listener);
  return () => {
    accessTokenListeners.delete(listener);
  };
}
