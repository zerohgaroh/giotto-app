import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { WaiterAddOrderScreen } from "../screens/waiter/WaiterAddOrderScreen";
import { WaiterHomeScreen } from "../screens/waiter/WaiterHomeScreen";
import { WaiterTableScreen } from "../screens/waiter/WaiterTableScreen";
import type { WaiterStackParamList } from "./types";

const Stack = createNativeStackNavigator<WaiterStackParamList>();

export function WaiterNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="WaiterHome" component={WaiterHomeScreen} />
      <Stack.Screen name="WaiterTable" component={WaiterTableScreen} />
      <Stack.Screen name="WaiterAddOrder" component={WaiterAddOrderScreen} />
    </Stack.Navigator>
  );
}
