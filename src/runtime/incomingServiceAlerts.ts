import type { RealtimeEvent, ServiceRequestType } from "../types/domain";

export type IncomingServiceAlertType = ServiceRequestType | "order";

export type IncomingServiceAlert = {
  id: string;
  dedupeKey: string;
  tableId: number;
  requestType: IncomingServiceAlertType;
  title: string;
  message: string;
  ts: number;
};

function normalizeLegacyReason(requestType: IncomingServiceAlertType, value: string) {
  const normalized = value.trim();
  if (!normalized) return "";

  const canonical = normalized.replace(/\.+$/u, "").trim().toLowerCase();
  if (canonical === "guests requested a waiter") {
    return "Гости ждут официанта.";
  }
  if (canonical === "guests are ready to pay") {
    return "Гости готовы оплатить заказ.";
  }
  if (canonical === "new order from guest cart") {
    return "Гости отправили заказ из корзины.";
  }
  if (/^\d+\s+items?\s+from guest cart$/u.test(canonical)) {
    return "Гости отправили заказ из корзины.";
  }

  return normalized;
}

function normalizeTableId(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed);
}

function normalizeRequestType(value: unknown): IncomingServiceAlertType | null {
  if (value === "bill" || value === "bill:requested") return "bill";
  if (value === "waiter" || value === "waiter:called") return "waiter";
  if (value === "order" || value === "order:submitted_by_guest") return "order";
  return null;
}

function buildTitle(tableId: number, requestType: IncomingServiceAlertType) {
  if (requestType === "order") return `Стол ${tableId} оформил заказ`;
  return requestType === "bill" ? `Стол ${tableId} просит счёт` : `Стол ${tableId} вызывает официанта`;
}

function buildMessage(requestType: IncomingServiceAlertType, reason?: string) {
  const normalizedReason = typeof reason === "string" ? normalizeLegacyReason(requestType, reason) : "";
  if (normalizedReason) return normalizedReason;
  if (requestType === "order") return "Гости отправили заказ из корзины.";
  return requestType === "bill" ? "Гости готовы оплатить заказ." : "Гости ждут официанта.";
}

export function createIncomingServiceAlert(input: {
  id?: string;
  tableId: unknown;
  requestType: unknown;
  reason?: unknown;
  ts?: unknown;
}): IncomingServiceAlert | null {
  const tableId = normalizeTableId(input.tableId);
  const requestType = normalizeRequestType(input.requestType);
  if (!tableId || !requestType) return null;

  const ts = Number(input.ts);
  return {
    id: typeof input.id === "string" && input.id.trim() ? input.id.trim() : `${tableId}:${requestType}:${Number.isFinite(ts) ? ts : Date.now()}`,
    dedupeKey: `${tableId}:${requestType}`,
    tableId,
    requestType,
    title: buildTitle(tableId, requestType),
    message: buildMessage(requestType, typeof input.reason === "string" ? input.reason : undefined),
    ts: Number.isFinite(ts) ? ts : Date.now(),
  };
}

export function createIncomingServiceAlertFromRealtime(event: RealtimeEvent) {
  if (event.type !== "waiter:called" && event.type !== "bill:requested" && event.type !== "order:submitted_by_guest") {
    return null;
  }

  return createIncomingServiceAlert({
    id: event.id,
    tableId: event.tableId,
    requestType: event.type,
    reason: event.payload?.reason ?? event.payload?.message,
    ts: event.ts,
  });
}
