import { Ionicons } from "@expo/vector-icons";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Pressable, StyleSheet, Text } from "react-native";
import { BrandHeaderTitle } from "../components/BrandHeaderTitle";
import { useAuth } from "../context/AuthContext";
import { ManagerHallScreen } from "../screens/manager/ManagerHallScreen";
import { ManagerHistoryScreen } from "../screens/manager/ManagerHistoryScreen";
import { ManagerLayoutScreen } from "../screens/manager/ManagerLayoutScreen";
import { ManagerMenuScreen } from "../screens/manager/ManagerMenuScreen";
import { ManagerTeamScreen } from "../screens/manager/ManagerTeamScreen";
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

export function ManagerTabsNavigator() {
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
          const map: Record<keyof ManagerTabParamList, keyof typeof Ionicons.glyphMap> = {
            ManagerHall: "grid",
            ManagerHistory: "time",
            ManagerTeam: "people",
            ManagerMenu: "restaurant",
            ManagerLayout: "map",
          };

          return <Ionicons name={map[route.name]} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="ManagerHall" component={ManagerHallScreen} options={{ title: "Зал" }} />
      <Tab.Screen name="ManagerHistory" component={ManagerHistoryScreen} options={{ title: "История" }} />
      <Tab.Screen name="ManagerTeam" component={ManagerTeamScreen} options={{ title: "Команда" }} />
      <Tab.Screen name="ManagerMenu" component={ManagerMenuScreen} options={{ title: "Меню" }} />
      <Tab.Screen name="ManagerLayout" component={ManagerLayoutScreen} options={{ title: "План" }} />
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
