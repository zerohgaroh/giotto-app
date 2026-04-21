import type { NavigatorScreenParams } from "@react-navigation/native";

export type WaiterTabParamList = {
  WaiterQueue: { highlightTableId?: number } | undefined;
  WaiterTables: undefined;
  WaiterShift: undefined;
};

export type WaiterStackParamList = {
  WaiterTabs: NavigatorScreenParams<WaiterTabParamList> | undefined;
  WaiterTable: { tableId: number };
  WaiterAddOrder: { tableId: number };
};

export type ManagerTabParamList = {
  ManagerHall: undefined;
  ManagerHistory: undefined;
  ManagerTeam: undefined;
  ManagerMenu: undefined;
  ManagerLayout: undefined;
  ManagerSettings: undefined;
};

export type ManagerStackParamList = {
  ManagerTabs: NavigatorScreenParams<ManagerTabParamList> | undefined;
  ManagerTable: { tableId: number };
  ManagerReviews: { waiterId?: string; waiterName?: string } | undefined;
};

export type RootStackParamList = {
  Login: undefined;
  WaiterApp: NavigatorScreenParams<WaiterStackParamList> | undefined;
  ManagerApp: NavigatorScreenParams<ManagerStackParamList> | undefined;
};
