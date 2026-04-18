import { Ionicons } from "@expo/vector-icons";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Pressable, StyleSheet, Text } from "react-native";
import { BrandHeaderTitle } from "../components/BrandHeaderTitle";
import { useAuth } from "../context/AuthContext";
import { WaiterHomeScreen } from "../screens/waiter/WaiterHomeScreen";
import { WaiterQueueScreen } from "../screens/waiter/WaiterQueueScreen";
import { WaiterShiftScreen } from "../screens/waiter/WaiterShiftScreen";
import { colors } from "../theme/colors";
import type { WaiterTabParamList } from "./types";

const Tab = createBottomTabNavigator<WaiterTabParamList>();

function LogoutButton() {
  const { signOut } = useAuth();

  return (
    <Pressable style={styles.logoutBtn} onPress={() => void signOut()}>
      <Text style={styles.logoutText}>Выйти</Text>
    </Pressable>
  );
}

export function WaiterTabsNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: colors.cream },
        headerShadowVisible: false,
        headerTitle: () => <BrandHeaderTitle />,
        headerTitleAlign: "center",
        headerRight: LogoutButton,
        tabBarActiveTintColor: colors.navy,
        tabBarInactiveTintColor: "#8A847A",
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
        tabBarStyle: {
          height: 64,
          paddingTop: 6,
          backgroundColor: "#FFFDF8",
        },
        tabBarIcon: ({ color, size }) => {
          const map: Record<keyof WaiterTabParamList, keyof typeof Ionicons.glyphMap> = {
            WaiterQueue: "notifications",
            WaiterTables: "grid",
            WaiterShift: "bar-chart",
          };

          return <Ionicons name={map[route.name]} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="WaiterQueue" component={WaiterQueueScreen} options={{ title: "Очередь" }} />
      <Tab.Screen name="WaiterTables" component={WaiterHomeScreen} options={{ title: "Столы" }} />
      <Tab.Screen name="WaiterShift" component={WaiterShiftScreen} options={{ title: "Смена" }} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  logoutBtn: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.white,
    marginRight: 10,
  },
  logoutText: {
    color: colors.navy,
    fontWeight: "600",
  },
});
