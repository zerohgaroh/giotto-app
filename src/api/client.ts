import type {
  HallData,
  RestaurantData,
  WaiterTableDetailResponse,
  WaiterTablesResponse,
} from "../types/domain";

const DEFAULT_BASE_URL = "http://localhost:3000";

export const API_BASE_URL = (process.env.EXPO_PUBLIC_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");

type RequestOptions = RequestInit & {
  query?: Record<string, string | number | boolean | undefined>;
};

class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
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

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { query, headers, ...rest } = options;

  const response = await fetch(buildUrl(path, query), {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(headers || {}),
    },
    credentials: "include",
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new ApiError(payload?.error || `HTTP ${response.status}`, response.status);
  }

  return payload as T;
}

export async function loginWaiter(login: string, password: string) {
  return request<{ session: { role: "waiter"; waiterId: string }; waiter: { id: string; name: string } }>(
    "/api/auth/login",
    {
      method: "POST",
      body: JSON.stringify({ login, password }),
    },
  );
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

export { ApiError };
