import assert from "node:assert/strict";
import test from "node:test";
import { createIncomingServiceAlert, createIncomingServiceAlertFromRealtime } from "./incomingServiceAlerts";

test("createIncomingServiceAlertFromRealtime builds waiter alert payload", () => {
  const alert = createIncomingServiceAlertFromRealtime({
    id: "event-1",
    type: "waiter:called",
    tableId: 12,
    ts: 200,
    payload: { reason: "Guests requested a waiter" },
  });

  assert.deepEqual(alert, {
    id: "event-1",
    dedupeKey: "12:waiter",
    tableId: 12,
    requestType: "waiter",
    title: "Стол 12 вызывает официанта",
    message: "Guests requested a waiter",
    ts: 200,
  });
});

test("createIncomingServiceAlert normalizes push payload fields", () => {
  const alert = createIncomingServiceAlert({
    tableId: "5",
    requestType: "bill",
    reason: "",
    ts: "300",
  });

  assert.equal(alert?.tableId, 5);
  assert.equal(alert?.requestType, "bill");
  assert.equal(alert?.message, "Гости готовы оплатить заказ.");
  assert.equal(alert?.dedupeKey, "5:bill");
});
