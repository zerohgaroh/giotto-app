import AsyncStorage from "@react-native-async-storage/async-storage";

const NOTE_DRAFT_PREFIX = "giotto.waiter.noteDraft.v2";
const ORDER_DRAFT_PREFIX = "giotto.waiter.orderDraft.v2";

type StoredOrderDraft = {
  qtyMap: Record<string, number>;
  mutationKey?: string;
};

function noteKey(tableId: number) {
  return `${NOTE_DRAFT_PREFIX}.${tableId}`;
}

function orderKey(tableId: number) {
  return `${ORDER_DRAFT_PREFIX}.${tableId}`;
}

export function createMutationKey(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

export async function loadNoteDraft(tableId: number) {
  const raw = await AsyncStorage.getItem(noteKey(tableId));
  return raw ?? "";
}

export async function saveNoteDraft(tableId: number, note: string) {
  await AsyncStorage.setItem(noteKey(tableId), note);
}

export async function clearNoteDraft(tableId: number) {
  await AsyncStorage.removeItem(noteKey(tableId));
}

export async function loadOrderDraft(tableId: number): Promise<StoredOrderDraft> {
  const raw = await AsyncStorage.getItem(orderKey(tableId));
  if (!raw) {
    return { qtyMap: {} };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<StoredOrderDraft>;
    return {
      qtyMap: parsed.qtyMap && typeof parsed.qtyMap === "object" ? parsed.qtyMap : {},
      mutationKey: typeof parsed.mutationKey === "string" ? parsed.mutationKey : undefined,
    };
  } catch {
    return { qtyMap: {} };
  }
}

export async function saveOrderDraft(tableId: number, draft: StoredOrderDraft) {
  await AsyncStorage.setItem(orderKey(tableId), JSON.stringify(draft));
}

export async function clearOrderDraft(tableId: number) {
  await AsyncStorage.removeItem(orderKey(tableId));
}
