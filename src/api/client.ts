import Constants from "expo-constants";
import { Platform } from "react-native";
import type {
  HallData,
  RestaurantData,
  WaiterTableDetailResponse,
  WaiterTablesResponse,
} from "../types/domain";

const DEFAULT_PORT = "3000";

function extractExpoHost(): string | null {
  const fromManifest2 = (Constants as unknown as {
    manifest2?: { extra?: { expoClient?: { hostUri?: string } } };
  }).manifest2?.extra?.expoClient?.hostUri;

  const fromExpoConfig = (Constants.expoConfig as { hostUri?: string } | null)?.hostUri;

  const fromLegacyManifest = (Constants as unknown as {
    manifest?: { debuggerHost?: string };
  }).manifest?.debuggerHost;

  const raw = fromManifest2 || fromExpoConfig || fromLegacyManifest;
  if (!raw) return null;
  return raw.split(":")[0] || null;
}

function resolveBaseUrl() {
  const envValue = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  const expoHost = extractExpoHost();

  if (!envValue || envValue.length === 0) {
    if (expoHost) return `http://${expoHost}:${DEFAULT_PORT}`;
    return `http://localhost:${DEFAULT_PORT}`;
  }

  const normalized = envValue.replace(/\/$/, "");

  // On physical devices localhost points to the phone itself.
  // When we can detect Expo dev host, remap localhost to machine IP.
  if (expoHost && /localhost|127\.0\.0\.1/.test(normalized)) {
    const hasExplicitPort = /:\d+$/.test(normalized);
    const port = hasExplicitPort ? normalized.split(":").pop() || DEFAULT_PORT : DEFAULT_PORT;
    const scheme = normalized.startsWith("https://") ? "https" : "http";
    return `${scheme}://${expoHost}:${port}`;
  }

  // Android emulator can use 10.0.2.2 for localhost when running local-only.
  if (Platform.OS === "android" && /localhost/.test(normalized) && !expoHost) {
    return normalized.replace("localhost", "10.0.2.2");
  }

  return normalized;
}

export const API_BASE_URL = resolveBaseUrl();

type RequestOptions = RequestInit & {
  query?: Record<string, string | number | boolean | undefined>;
};

export class ApiError extends Error {
  status: number;
  code: "network" | "http";

  constructor(message: string, status: number, code: "network" | "http" = "http") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function buildUrl(path: string, query?: RequestOptions["query"]) {
  const url = new URL(`${API_BASE_URL}${path}`);
  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value === undefined) return;
      url.searchParams.set(key, String(value));
    });
  }
  return url.toString();
}

function parseJsonSafe(text: string) {
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { query, headers, ...rest } = options;

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      ...rest,
      headers: {
        "Content-Type": "application/json",
        ...(headers || {}),
      },
      credentials: "include",
    });
  } catch {
    throw new ApiError(
      `Network request failed. Проверьте доступ к API: ${API_BASE_URL}`,
      0,
      "network",
    );
  }

  const text = await response.text();
  const payload = parseJsonSafe(text);

  if (!response.ok) {
    throw new ApiError(String(payload?.error || `HTTP ${response.status}`), response.status, "http");
  }

  return payload as T;
}

export type LoginResponse =
  | {
      session: { role: "waiter"; waiterId: string };
      waiter: { id: string; name: string };
      manager?: never;
    }
  | {
      session: { role: "manager"; managerId: string };
      manager: { id: string; name: string };
      waiter?: never;
    };

export async function loginStaff(login: string, password: string) {
  return request<LoginResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ login, password }),
  });
}

export async function logoutWaiter() {
  return request<{ ok: boolean }>("/api/auth/logout", { method: "POST" });
}

export async function fetchWaiterTables() {
  return request<WaiterTablesResponse>("/api/waiter/me/tables");
}

export async function fetchWaiterTable(tableId: number) {
  return request<WaiterTableDetailResponse>(`/api/waiter/tables/${tableId}`);
}

export async function ackWaiterRequest(tableId: number, requestId: string) {
  return request<WaiterTableDetailResponse>(`/api/waiter/tables/${tableId}/ack`, {
    method: "POST",
    body: JSON.stringify({ requestId }),
  });
}

export async function doneWaiter(tableId: number) {
  return request<WaiterTableDetailResponse>(`/api/waiter/tables/${tableId}/done`, {
    method: "POST",
  });
}

export async function setTableNote(tableId: number, note: string) {
  return request<WaiterTableDetailResponse>(`/api/waiter/tables/${tableId}/note`, {
    method: "PATCH",
    body: JSON.stringify({ note }),
  });
}

export async function addWaiterOrder(
  tableId: number,
  items: Array<{ dishId?: string; title: string; qty: number; price: number; note?: string }>,
) {
  return request<WaiterTableDetailResponse>(`/api/waiter/tables/${tableId}/orders`, {
    method: "POST",
    body: JSON.stringify({ items }),
  });
}

export async function fetchHallData() {
  return request<HallData>("/api/hall");
}

export async function updateHallData(hall: HallData) {
  return request<HallData>("/api/hall", {
    method: "PUT",
    body: JSON.stringify(hall),
  });
}

export async function resetHallData() {
  return request<HallData>("/api/hall/reset", {
    method: "POST",
  });
}

export async function fetchRestaurantData() {
  return request<RestaurantData>("/api/restaurant");
}

export async function updateRestaurantData(data: RestaurantData) {
  return request<RestaurantData>("/api/restaurant", {
    method: "PUT",
    body: JSON.stringify(data),
  });
}
