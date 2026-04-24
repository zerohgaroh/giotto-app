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
    message: "Гости ждут официанта.",
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

test("createIncomingServiceAlertFromRealtime builds guest order alert payload", () => {
  const alert = createIncomingServiceAlertFromRealtime({
    id: "event-2",
    type: "order:submitted_by_guest",
    tableId: 7,
    ts: 400,
    payload: { itemCount: 3 },
  });

  assert.deepEqual(alert, {
    id: "event-2",
    dedupeKey: "7:order",
    tableId: 7,
    requestType: "order",
    title: "Стол 7 оформил заказ",
    message: "Гости отправили заказ из корзины.",
    ts: 400,
  });
});

test("createIncomingServiceAlert normalizes legacy English reasons to Russian copy", () => {
  const bill = createIncomingServiceAlert({
    tableId: 5,
    requestType: "bill",
    reason: "Guests are ready to pay",
  });
  const order = createIncomingServiceAlert({
    tableId: 8,
    requestType: "order",
    reason: "3 items from guest cart.",
  });

  assert.equal(bill?.message, "Гости готовы оплатить заказ.");
  assert.equal(order?.message, "Гости отправили заказ из корзины.");
});
