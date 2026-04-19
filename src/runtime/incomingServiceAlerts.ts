import type { RealtimeEvent, ServiceRequestType } from "../types/domain";

export type IncomingServiceAlert = {
  id: string;
  dedupeKey: string;
  tableId: number;
  requestType: ServiceRequestType;
  title: string;
  message: string;
  ts: number;
};

function normalizeTableId(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed);
}

function normalizeRequestType(value: unknown): ServiceRequestType | null {
  if (value === "bill" || value === "bill:requested") return "bill";
  if (value === "waiter" || value === "waiter:called") return "waiter";
  return null;
}

function buildTitle(tableId: number, requestType: ServiceRequestType) {
  return requestType === "bill" ? `Стол ${tableId} просит счёт` : `Стол ${tableId} вызывает официанта`;
}

function buildMessage(requestType: ServiceRequestType, reason?: string) {
  const normalizedReason = typeof reason === "string" ? reason.trim() : "";
  if (normalizedReason) return normalizedReason;
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
  if (event.type !== "waiter:called" && event.type !== "bill:requested") {
    return null;
  }

  return createIncomingServiceAlert({
    id: event.id,
    tableId: event.tableId,
    requestType: event.type,
    reason: event.payload?.reason,
    ts: event.ts,
  });
}
