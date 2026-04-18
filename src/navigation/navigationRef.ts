import { createNavigationContainerRef } from "@react-navigation/native";
import { createPendingTableNavigator } from "./pendingNavigation";
import type { RootStackParamList } from "./types";

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

function navigateToWaiterTable(tableId: number) {
  navigationRef.navigate("WaiterApp", {
    screen: "WaiterTable",
    params: { tableId },
  });
}

function navigateToWaiterQueue(tableId: number) {
  navigationRef.navigate("WaiterApp", {
    screen: "WaiterTabs",
    params: {
      screen: "WaiterQueue",
      params: { highlightTableId: tableId },
    },
  });
}

const pendingNavigator = createPendingTableNavigator(navigateToWaiterTable);
const pendingQueueNavigator = createPendingTableNavigator(navigateToWaiterQueue);

export function openWaiterTable(tableId: number) {
  pendingNavigator.open(tableId, navigationRef.isReady());
}

export function openWaiterQueueForTable(tableId: number) {
  pendingQueueNavigator.open(tableId, navigationRef.isReady());
}

export function flushPendingNavigation() {
  pendingNavigator.flush(navigationRef.isReady());
  pendingQueueNavigator.flush(navigationRef.isReady());
}
