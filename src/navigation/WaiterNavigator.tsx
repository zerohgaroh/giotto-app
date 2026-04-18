import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { WaiterAddOrderScreen } from "../screens/waiter/WaiterAddOrderScreen";
import { WaiterTableScreen } from "../screens/waiter/WaiterTableScreen";
import type { WaiterStackParamList } from "./types";
import { WaiterTabsNavigator } from "./WaiterTabsNavigator";

const Stack = createNativeStackNavigator<WaiterStackParamList>();

export function WaiterNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="WaiterTabs" component={WaiterTabsNavigator} />
      <Stack.Screen name="WaiterTable" component={WaiterTableScreen} />
      <Stack.Screen name="WaiterAddOrder" component={WaiterAddOrderScreen} />
    </Stack.Navigator>
  );
}
