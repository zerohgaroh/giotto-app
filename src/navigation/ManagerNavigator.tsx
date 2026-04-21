import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ManagerReviewsScreen } from "../screens/manager/ManagerReviewsScreen";
import { ManagerTableScreen } from "../screens/manager/ManagerTableScreen";
import type { ManagerStackParamList } from "./types";
import { ManagerTabsNavigator } from "./ManagerTabsNavigator";

const Stack = createNativeStackNavigator<ManagerStackParamList>();

export function ManagerNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ManagerTabs" component={ManagerTabsNavigator} />
      <Stack.Screen name="ManagerTable" component={ManagerTableScreen} />
      <Stack.Screen name="ManagerReviews" component={ManagerReviewsScreen} />
    </Stack.Navigator>
  );
}
