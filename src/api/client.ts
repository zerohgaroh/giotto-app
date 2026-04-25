import Constants from "expo-constants";
import type { ImagePickerAsset } from "expo-image-picker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { getAccessToken, setAccessToken, subscribeAccessToken } from "./accessTokenStore";
import { normalizeManagerPassword, normalizeStaffLogin, resolveStaffLoginCandidates } from "./staffCredentials";
import { shouldRefreshAccessToken } from "./tokenFreshness";
import type {
  FloorZone,
  FloorTableSizePreset,
  HallData,
  ManagerHallResponse,
  ManagerHistoryPage,
  ManagerLayoutSnapshot,
  ManagerMenuSnapshot,
  MenuImageUploadResponse,
  ManagerTableDetail,
  ManagerWaiterDetail,
  ManagerWaiterSummary,
  PushDeviceRegistration,
  ReviewHistoryPage,
  RestaurantData,
  StaffBootstrapResponse,
  StaffLoginResponse,
  WaiterQueueResponse,
  WaiterShiftSummary,
  WaiterShortcuts,
  WaiterTableDetailResponse,
  WaiterTablesResponse,
} from "../types/domain";

export { getAccessToken, setAccessToken, subscribeAccessToken } from "./accessTokenStore";
export { shouldRefreshAccessToken } from "./tokenFreshness";

const DEFAULT_PORT = "3000";
const REFRESH_TOKEN_KEY = "giotto.mobile.refreshToken.v2";
const REFRESH_TOKEN_FALLBACK_KEY = "giotto.mobile.refreshToken.fallback.v1";
const REQUEST_TIMEOUT_MS = 25000;
const EMPTY_REVIEW_HISTORY_PAGE: ReviewHistoryPage = {
  analytics: {
    avgRating: 0,
    reviewsCount: 0,
    commentsCount: 0,
    distribution: {
      rating1: 0,
      rating2: 0,
      rating3: 0,
      rating4: 0,
      rating5: 0,
    },
  },
  items: [],
};

let refreshInFlight: Promise<StaffLoginResponse | null> | null = null;
let accessTokenExpiresAtMemory = 0;

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

function isPrivateHost(host: string) {
  if (host === "localhost" || host === "127.0.0.1") return true;
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;

  const octets = host.split(".");
  if (octets.length === 4 && octets.every((part) => /^\d+$/.test(part))) {
    const second = Number(octets[1]);
    if (Number(octets[0]) === 172 && second >= 16 && second <= 31) return true;
  }

  return false;
}

function replaceUrlHost(rawUrl: string, nextHost: string) {
  const url = new URL(rawUrl);
  url.hostname = nextHost;
  return url.toString().replace(/\/$/, "");
}

function resolveBaseUrl() {
  const envValue = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  const expoHost = extractExpoHost();

  if (!envValue || envValue.length === 0) {
    if (expoHost) return `http://${expoHost}:${DEFAULT_PORT}`;
    return `http://localhost:${DEFAULT_PORT}`;
  }

  const normalized = envValue.replace(/\/$/, "");

  if (expoHost && expoHost !== "localhost" && expoHost !== "127.0.0.1") {
    try {
      const currentHost = new URL(normalized).hostname;
      if (currentHost !== expoHost && isPrivateHost(currentHost) && isPrivateHost(expoHost)) {
        return replaceUrlHost(normalized, expoHost);
      }
    } catch {
      // ignore malformed env and fall through to standard handling
    }
  }

  if (expoHost && /localhost|127\.0\.0\.1/.test(normalized)) {
    const hasExplicitPort = /:\d+$/.test(normalized);
    const port = hasExplicitPort ? normalized.split(":").pop() || DEFAULT_PORT : DEFAULT_PORT;
    const scheme = normalized.startsWith("https://") ? "https" : "http";
    return `${scheme}://${expoHost}:${port}`;
  }

  if (Platform.OS === "android" && /localhost/.test(normalized) && !expoHost) {
    return normalized.replace("localhost", "10.0.2.2");
  }

  return normalized;
}

export const API_BASE_URL = resolveBaseUrl();

type RequestOptions = RequestInit & {
  auth?: boolean;
  allow401?: boolean;
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

function asRecord(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function normalizeToken(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeRole(value: unknown) {
  return value === "waiter" || value === "manager" ? value : null;
}

function normalizeStaffLoginResponse(input: unknown): StaffLoginResponse {
  const payload = asRecord(input);

  const accessToken = normalizeToken(
    payload.accessToken ?? payload.access_token ?? payload.token ?? payload.jwt,
  );
  if (!accessToken) {
    const serverMessage = normalizeToken(payload.error ?? payload.message);
    throw new ApiError(serverMessage ?? "Некорректный ответ сервера авторизации.", 502, "http");
  }

  const userPayload = asRecord(payload.user);
  const role = normalizeRole(payload.role) ?? normalizeRole(userPayload.role);
  if (!role) {
    throw new ApiError("Некорректная роль в ответе сервера авторизации.", 502, "http");
  }

  const userId =
    normalizeToken(userPayload.id ?? payload.userId ?? payload.user_id ?? payload.staffUserId ?? payload.staff_user_id) ??
    "unknown";
  const userName = normalizeToken(userPayload.name ?? payload.userName ?? payload.user_name ?? payload.name) ?? "Сотрудник";

  const refreshToken = normalizeToken(payload.refreshToken ?? payload.refresh_token ?? payload.refresh) ?? "";

  const expiresAtRaw = Number(payload.expiresAt ?? payload.expires_at);
  const expiresInSec = Number(payload.expiresIn ?? payload.expires_in);
  let expiresAt = Number.isFinite(expiresAtRaw) ? expiresAtRaw : NaN;
  if (!Number.isFinite(expiresAt) && Number.isFinite(expiresInSec)) {
    expiresAt = Date.now() + expiresInSec * 1000;
  }
  if (!Number.isFinite(expiresAt)) {
    expiresAt = Date.now() + 30 * 60 * 1000;
  }

  return {
    accessToken,
    refreshToken,
    role,
    user: {
      id: userId,
      name: userName,
      role,
    },
    expiresAt,
  };
}

async function readRefreshToken() {
  try {
    const fromSecureStore = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
    if (fromSecureStore) {
      return fromSecureStore;
    }
  } catch (error) {
    console.warn("[auth] Failed to read refresh token from SecureStore, falling back to AsyncStorage", error);
  }

  try {
    return await AsyncStorage.getItem(REFRESH_TOKEN_FALLBACK_KEY);
  } catch (error) {
    console.warn("[auth] Failed to read refresh token from AsyncStorage", error);
    return null;
  }
}

async function writeRefreshToken(refreshToken: unknown) {
  const normalizedRefreshToken = normalizeToken(refreshToken);
  if (!normalizedRefreshToken) {
    await clearRefreshToken();
    return false;
  }

  try {
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, normalizedRefreshToken);
    try {
      await AsyncStorage.removeItem(REFRESH_TOKEN_FALLBACK_KEY);
    } catch {
      // best-effort cleanup only
    }
    return true;
  } catch (error) {
    console.warn("[auth] Failed to save refresh token in SecureStore, using AsyncStorage fallback", error);
  }

  try {
    await AsyncStorage.setItem(REFRESH_TOKEN_FALLBACK_KEY, normalizedRefreshToken);
    return true;
  } catch (error) {
    console.warn("[auth] Failed to save refresh token in fallback storage", error);
    return false;
  }
}

async function clearRefreshToken() {
  try {
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  } catch (error) {
    console.warn("[auth] Failed to clear refresh token from SecureStore", error);
  }

  try {
    await AsyncStorage.removeItem(REFRESH_TOKEN_FALLBACK_KEY);
  } catch (error) {
    console.warn("[auth] Failed to clear refresh token from AsyncStorage", error);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function persistAuth(response: unknown): Promise<StaffLoginResponse> {
  const normalized = normalizeStaffLoginResponse(response);
  accessTokenExpiresAtMemory = normalized.expiresAt;
  setAccessToken(normalized.accessToken);

  const storedRefreshToken = await writeRefreshToken(normalized.refreshToken);
  if (!storedRefreshToken) {
    console.warn("[auth] Login response does not contain refreshToken; session refresh after expiry is unavailable");
  }

  return normalized;
}

export async function clearStoredAuth() {
  accessTokenExpiresAtMemory = 0;
  setAccessToken(null);
  await clearRefreshToken();
}

export async function ensureFreshAccessToken(minTtlMs = 60_000) {
  const current = getAccessToken();
  if (current && !shouldRefreshAccessToken(accessTokenExpiresAtMemory, Date.now(), minTtlMs)) {
    return current;
  }

  const refreshed = await refreshAccessToken();
  return refreshed?.accessToken ?? getAccessToken();
}

async function rawRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { query, headers, auth = true, ...rest } = options;
  const isFormData = typeof FormData !== "undefined" && rest.body instanceof FormData;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      ...rest,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(isFormData ? {} : { "Content-Type": "application/json; charset=utf-8" }),
        ...(auth && getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {}),
        ...(headers || {}),
      },
    });
  } catch {
    throw new ApiError(`Network request failed. Check API reachability at ${API_BASE_URL}`, 0, "network");
  } finally {
    clearTimeout(timeout);
  }

  const text = await response.text();
  const payload = parseJsonSafe(text);

  if (!response.ok) {
    throw new ApiError(String(payload?.error || `HTTP ${response.status}`), response.status, "http");
  }

  return payload as T;
}

async function refreshAccessToken(): Promise<StaffLoginResponse | null> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const refreshToken = await readRefreshToken();
    if (!refreshToken) return null;

    try {
      const response = await rawRequest<Record<string, unknown>>("/api/staff/auth/refresh", {
        method: "POST",
        auth: false,
        body: JSON.stringify({ refreshToken }),
      });
      return await persistAuth(response);
    } catch {
      await clearStoredAuth();
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  try {
    return await rawRequest<T>(path, options);
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    if (!options.auth || options.allow401 || error.status !== 401) throw error;

    const refreshed = await refreshAccessToken();
    if (!refreshed) throw error;

    return rawRequest<T>(path, options);
  }
}

export async function bootstrapStaffSession() {
  try {
    if (getAccessToken()) {
      return await request<StaffBootstrapResponse>("/api/staff/me", { auth: true });
    }
  } catch {
    // fall through to refresh
  }

  const refreshed = await refreshAccessToken();
  if (!refreshed) return null;

  try {
    return await request<StaffBootstrapResponse>("/api/staff/me", { auth: true });
  } catch {
    await clearStoredAuth();
    return null;
  }
}

export async function loginStaff(login: string, password: string) {
  const candidates = resolveStaffLoginCandidates(login);
  if (!candidates.length) {
    throw new ApiError("Введите логин.", 400, "http");
  }

  let lastError: unknown = null;
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    const payload = {
      method: "POST",
      auth: false,
      body: JSON.stringify({ login: candidate, password }),
    } as const;

    try {
      const response = await rawRequest<Record<string, unknown>>("/api/staff/auth/login", payload);
      return await persistAuth(response);
    } catch (error) {
      if (error instanceof ApiError && error.code === "network") {
        // Mobile networks can briefly drop the very first request after app wake/start.
        await sleep(700);
        const retryResponse = await rawRequest<Record<string, unknown>>("/api/staff/auth/login", payload);
        return await persistAuth(retryResponse);
      }

      if (
        error instanceof ApiError &&
        error.status === 401 &&
        index < candidates.length - 1
      ) {
        lastError = error;
        continue;
      }

      throw error;
    }
  }

  throw lastError instanceof Error ? lastError : new ApiError("Не удалось войти.", 401, "http");
}

export async function logoutStaff() {
  const refreshToken = await readRefreshToken();
  try {
    await request<{ ok: boolean }>("/api/staff/auth/logout", {
      method: "POST",
      auth: true,
      allow401: true,
      body: JSON.stringify({ refreshToken }),
    });
  } catch {
    // ignore logout transport failures
  } finally {
    await clearStoredAuth();
  }
}

export async function fetchWaiterTables() {
  return request<WaiterTablesResponse>("/api/staff/waiter/tables");
}

export async function fetchWaiterQueue() {
  return request<WaiterQueueResponse>("/api/staff/waiter/queue");
}

export async function fetchWaiterTable(tableId: number) {
  return request<WaiterTableDetailResponse>(`/api/staff/waiter/tables/${tableId}`);
}

export async function ackWaiterTask(taskId: string) {
  return request<WaiterTableDetailResponse>(`/api/staff/waiter/tasks/${taskId}/ack`, {
    method: "POST",
  });
}

export async function startWaiterTask(taskId: string) {
  return request<WaiterTableDetailResponse>(`/api/staff/waiter/tasks/${taskId}/start`, {
    method: "POST",
  });
}

export async function completeWaiterTask(taskId: string, mutationKey?: string) {
  return request<WaiterTableDetailResponse>(`/api/staff/waiter/tasks/${taskId}/complete`, {
    method: "POST",
    body: JSON.stringify({ mutationKey }),
  });
}

export async function ackWaiterRequest(tableId: number, requestId: string) {
  return request<WaiterTableDetailResponse>(`/api/staff/waiter/tables/${tableId}/ack`, {
    method: "POST",
    body: JSON.stringify({ requestId }),
  });
}

export async function createWaiterFollowUp(
  tableId: number,
  payload: { title: string; dueInMin?: number; note?: string },
) {
  return request<WaiterTableDetailResponse>(`/api/staff/waiter/tables/${tableId}/follow-ups`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function doneWaiter(tableId: number) {
  return request<WaiterTableDetailResponse>(`/api/staff/waiter/tables/${tableId}/done`, {
    method: "POST",
  });
}

export async function finishWaiterTable(tableId: number, mutationKey?: string) {
  return request<WaiterTableDetailResponse>(`/api/staff/waiter/tables/${tableId}/finish`, {
    method: "POST",
    body: JSON.stringify({ mutationKey }),
  });
}

export async function setTableNote(tableId: number, note: string) {
  return request<WaiterTableDetailResponse>(`/api/staff/waiter/tables/${tableId}/note`, {
    method: "PATCH",
    body: JSON.stringify({ note }),
  });
}

export async function addWaiterOrder(
  tableId: number,
  items: Array<{ dishId?: string; title: string; qty: number; price: number; note?: string }>,
  mutationKey?: string,
) {
  return request<WaiterTableDetailResponse>(`/api/staff/waiter/tables/${tableId}/orders`, {
    method: "POST",
    body: JSON.stringify({ items, mutationKey }),
  });
}

export async function repeatLastWaiterOrder(tableId: number, payload?: { sourceSessionId?: string; mutationKey?: string }) {
  return request<WaiterTableDetailResponse>(`/api/staff/waiter/tables/${tableId}/orders/repeat-last`, {
    method: "POST",
    body: JSON.stringify(payload ?? {}),
  });
}

export async function fetchWaiterShortcuts() {
  return request<WaiterShortcuts>("/api/staff/waiter/shortcuts");
}

export async function updateWaiterShortcuts(payload: WaiterShortcuts) {
  return request<WaiterShortcuts>("/api/staff/waiter/shortcuts", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function fetchWaiterShiftSummary() {
  return request<WaiterShiftSummary>("/api/staff/waiter/shift-summary");
}

export async function fetchWaiterReviews(params?: { cursor?: string; limit?: number }) {
  try {
    return await request<ReviewHistoryPage>("/api/staff/waiter/reviews", {
      query: params ?? {},
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      console.warn("[reviews] waiter endpoint is not available on backend, returning empty page fallback", {
        params: params ?? null,
      });
      return EMPTY_REVIEW_HISTORY_PAGE;
    }
    throw error;
  }
}

export async function fetchManagerHall() {
  return request<ManagerHallResponse>("/api/staff/manager/hall");
}

export async function fetchManagerTable(tableId: number) {
  return request<ManagerTableDetail>(`/api/staff/manager/tables/${tableId}`);
}

export async function reassignManagerTable(tableId: number, waiterId?: string) {
  return request<ManagerTableDetail>(`/api/staff/manager/tables/${tableId}/reassign`, {
    method: "POST",
    body: JSON.stringify({ waiterId }),
  });
}

export async function closeManagerTable(tableId: number) {
  return request<ManagerTableDetail>(`/api/staff/manager/tables/${tableId}/close`, {
    method: "POST",
  });
}

export async function fetchManagerHistory(params: {
  tableId?: number;
  waiterId?: string;
  type?: string;
  cursor?: string;
  limit?: number;
}) {
  return request<ManagerHistoryPage>("/api/staff/manager/history", {
    query: params,
  });
}

export async function fetchManagerReviews(params?: {
  waiterId?: string;
  cursor?: string;
  limit?: number;
}) {
  try {
    return await request<ReviewHistoryPage>("/api/staff/manager/reviews", {
      query: params ?? {},
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      console.warn("[reviews] manager endpoint is not available on backend, returning empty page fallback", {
        params: params ?? null,
      });
      return EMPTY_REVIEW_HISTORY_PAGE;
    }
    throw error;
  }
}

export async function fetchManagerRestaurantSettings() {
  return request<RestaurantData>("/api/staff/manager/restaurant");
}

export async function updateManagerRestaurantSettings(payload: RestaurantData["profile"]) {
  return request<RestaurantData>("/api/staff/manager/restaurant", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function fetchManagerWaiters() {
  return request<ManagerWaiterSummary[]>("/api/staff/manager/waiters");
}

export async function fetchManagerWaiter(waiterId: string) {
  return request<ManagerWaiterDetail>(`/api/staff/manager/waiters/${waiterId}`);
}

export async function createManagerWaiter(payload: {
  name: string;
  login: string;
  password: string;
  tableIds: number[];
}) {
  const name = payload.name.trim();
  const login = normalizeStaffLogin(payload.login);
  const password = normalizeManagerPassword(payload.password);
  return request<ManagerWaiterDetail>("/api/staff/manager/waiters", {
    method: "POST",
    body: JSON.stringify({
      ...payload,
      name,
      login,
      password,
    }),
  });
}

export async function updateManagerWaiter(
  waiterId: string,
  payload: {
    name?: string;
    login?: string;
    active?: boolean;
  },
) {
  const normalizedPayload = {
    ...payload,
    ...(payload.name !== undefined ? { name: payload.name.trim() } : {}),
    ...(payload.login !== undefined ? { login: normalizeStaffLogin(payload.login) } : {}),
  };
  return request<ManagerWaiterDetail>(`/api/staff/manager/waiters/${waiterId}`, {
    method: "PATCH",
    body: JSON.stringify(normalizedPayload),
  });
}

export async function deleteManagerWaiter(waiterId: string) {
  try {
    return await request<{ ok: boolean }>(`/api/staff/manager/waiters/${waiterId}`, {
      method: "DELETE",
    });
  } catch (error) {
    if (!(error instanceof ApiError) || (error.status !== 404 && error.status !== 405)) {
      throw error;
    }

    try {
      return await request<{ ok: boolean }>(`/api/staff/manager/waiters/${waiterId}/delete`, {
        method: "POST",
        body: JSON.stringify({}),
      });
    } catch (fallbackError) {
      if (
        !(fallbackError instanceof ApiError) ||
        (fallbackError.status !== 404 && fallbackError.status !== 405 && fallbackError.status !== 501)
      ) {
        throw fallbackError;
      }

      // Compatibility fallback for older/proxied backends:
      // emulate deletion by clearing assignments + deactivating waiter.
      await request<ManagerWaiterDetail>(`/api/staff/manager/waiters/${waiterId}/assignments`, {
        method: "PUT",
        body: JSON.stringify({ tableIds: [] }),
      });
      await request<ManagerWaiterDetail>(`/api/staff/manager/waiters/${waiterId}`, {
        method: "PATCH",
        body: JSON.stringify({ active: false }),
      });
      return { ok: true };
    }
  }
}

export async function resetManagerWaiterPassword(waiterId: string, password: string) {
  const normalizedPassword = normalizeManagerPassword(password);
  return request<ManagerWaiterDetail>(`/api/staff/manager/waiters/${waiterId}/reset-password`, {
    method: "POST",
    body: JSON.stringify({ password: normalizedPassword }),
  });
}

export async function replaceManagerWaiterAssignments(waiterId: string, tableIds: number[]) {
  return request<ManagerWaiterDetail>(`/api/staff/manager/waiters/${waiterId}/assignments`, {
    method: "PUT",
    body: JSON.stringify({ tableIds }),
  });
}

export async function fetchManagerMenu() {
  return request<ManagerMenuSnapshot>("/api/staff/manager/menu");
}

export async function createManagerCategory(payload: {
  labelRu: string;
  icon?: string;
  sortOrder?: number;
}) {
  return request<ManagerMenuSnapshot>("/api/staff/manager/menu/categories", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateManagerCategory(
  categoryId: string,
  payload: { labelRu: string; icon?: string; sortOrder?: number },
) {
  return request<ManagerMenuSnapshot>(`/api/staff/manager/menu/categories/${categoryId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteManagerCategory(categoryId: string) {
  return request<ManagerMenuSnapshot>(`/api/staff/manager/menu/categories/${categoryId}`, {
    method: "DELETE",
  });
}

export async function createManagerDish(payload: {
  categoryId: string;
  nameRu: string;
  nameIt: string;
  description: string;
  price: number;
  image: string;
  portion: string;
  energyKcal: number;
  badgeLabel?: string;
  badgeTone?: string;
  highlight?: boolean;
  available: boolean;
}) {
  return request<ManagerMenuSnapshot>("/api/staff/manager/menu/dishes", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

function inferAssetType(asset: ImagePickerAsset) {
  if (asset.mimeType?.trim()) return asset.mimeType.trim();
  const lower = asset.fileName?.toLowerCase() ?? asset.uri.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

function inferAssetName(asset: ImagePickerAsset) {
  if (asset.fileName?.trim()) return asset.fileName.trim();
  const ext =
    inferAssetType(asset) === "image/png"
      ? "png"
      : inferAssetType(asset) === "image/webp"
        ? "webp"
        : "jpg";
  return `menu-image-${Date.now()}.${ext}`;
}

export async function uploadManagerMenuImage(asset: ImagePickerAsset) {
  const formData = new FormData();
  formData.append("file", {
    uri: asset.uri,
    name: inferAssetName(asset),
    type: inferAssetType(asset),
  } as never);

  return request<MenuImageUploadResponse>("/api/staff/manager/menu/images", {
    method: "POST",
    body: formData,
  });
}

export async function updateManagerDish(
  dishId: string,
  payload: {
    categoryId: string;
    nameRu: string;
    nameIt: string;
    description: string;
    price: number;
    image: string;
    portion: string;
    energyKcal: number;
    badgeLabel?: string;
    badgeTone?: string;
    highlight?: boolean;
    available: boolean;
  },
) {
  return request<ManagerMenuSnapshot>(`/api/staff/manager/menu/dishes/${dishId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteManagerDish(dishId: string) {
  return request<ManagerMenuSnapshot>(`/api/staff/manager/menu/dishes/${dishId}`, {
    method: "DELETE",
  });
}

export async function toggleManagerDishAvailability(dishId: string) {
  return request<ManagerMenuSnapshot>(`/api/staff/manager/menu/dishes/${dishId}/toggle-availability`, {
    method: "POST",
  });
}

export async function reorderManagerMenu(payload: {
  categoryIds?: string[];
  dishIdsByCategory?: Record<string, string[]>;
}) {
  return request<ManagerMenuSnapshot>("/api/staff/manager/menu/reorder", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function fetchManagerLayout() {
  return request<ManagerLayoutSnapshot>("/api/staff/manager/layout");
}

export async function updateManagerLayout(payload: {
  tables: Array<{
    tableId: number;
    label?: string;
    zoneId?: string;
    x: number;
    y: number;
    shape: "square" | "round" | "rect";
    sizePreset: FloorTableSizePreset;
  }>;
  zones: FloorZone[];
}) {
  return request<ManagerLayoutSnapshot>("/api/staff/manager/layout", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function createManagerTable(payload?: {
  label?: string;
  zoneId?: string;
  shape?: "square" | "round" | "rect";
  sizePreset?: FloorTableSizePreset;
  x?: number;
  y?: number;
}) {
  return request<ManagerLayoutSnapshot>("/api/staff/manager/tables", {
    method: "POST",
    body: JSON.stringify(payload ?? {}),
  });
}

export async function archiveManagerTable(tableId: number) {
  return request<ManagerLayoutSnapshot>(`/api/staff/manager/tables/${tableId}/archive`, {
    method: "POST",
  });
}

export async function restoreManagerTable(tableId: number) {
  return request<ManagerLayoutSnapshot>(`/api/staff/manager/tables/${tableId}/restore`, {
    method: "POST",
  });
}

export async function registerPushToken(payload: PushDeviceRegistration) {
  return request<{ ok: boolean }>("/api/staff/devices/push-token", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchRestaurantData() {
  return request<RestaurantData>("/api/restaurant", { auth: false });
}

export async function fetchHallData() {
  return request<HallData>("/api/hall", { auth: false });
}

export async function resetHallData() {
  return request<HallData>("/api/hall/reset", {
    method: "POST",
    auth: false,
  });
}

export async function updateRestaurantData(data: RestaurantData) {
  return request<RestaurantData>("/api/restaurant", {
    method: "PUT",
    auth: true,
    body: JSON.stringify(data),
  });
}
