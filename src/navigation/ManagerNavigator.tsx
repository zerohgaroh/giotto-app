import { Ionicons } from "@expo/vector-icons";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Pressable, StyleSheet, Text } from "react-native";
import { useAuth } from "../context/AuthContext";
import { ManagerHallScreen } from "../screens/manager/ManagerHallScreen";
import { ManagerMenuScreen } from "../screens/manager/ManagerMenuScreen";
import { ManagerWaitersScreen } from "../screens/manager/ManagerWaitersScreen";
import { colors } from "../theme/colors";
import type { ManagerTabParamList } from "./types";

const Tab = createBottomTabNavigator<ManagerTabParamList>();

function LogoutButton() {
  const { signOut } = useAuth();
  return (
    <Pressable style={styles.logoutBtn} onPress={() => void signOut()}>
      <Text style={styles.logoutText}>Выйти</Text>
    </Pressable>
  );
}

export function ManagerNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: colors.cream },
        headerShadowVisible: false,
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
          const map: Record<string, keyof typeof Ionicons.glyphMap> = {
            ManagerHall: "grid",
            ManagerWaiters: "people",
            ManagerMenu: "restaurant",
          };
          return <Ionicons name={map[route.name]} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="ManagerHall" component={ManagerHallScreen} options={{ title: "Зал" }} />
      <Tab.Screen name="ManagerWaiters" component={ManagerWaitersScreen} options={{ title: "Официанты" }} />
      <Tab.Screen name="ManagerMenu" component={ManagerMenuScreen} options={{ title: "Меню" }} />
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
