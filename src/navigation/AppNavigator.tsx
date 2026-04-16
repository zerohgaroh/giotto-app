import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ActivityIndicator, SafeAreaView, StyleSheet, View } from "react-native";
import { useAuth } from "../context/AuthContext";
import { LoginScreen } from "../screens/LoginScreen";
import { colors } from "../theme/colors";
import { ManagerNavigator } from "./ManagerNavigator";
import { WaiterNavigator } from "./WaiterNavigator";

const Stack = createNativeStackNavigator();

const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.cream,
    card: colors.cream,
    text: colors.navyDeep,
    border: colors.line,
    primary: colors.navy,
  },
};

export function AppNavigator() {
  const { loading, role } = useAuth();

  if (loading) {
    return (
      <SafeAreaView style={styles.loaderArea}>
        <View style={styles.loaderCenter}>
          <ActivityIndicator color={colors.navy} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <NavigationContainer theme={navigationTheme}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!role ? <Stack.Screen name="Login" component={LoginScreen} /> : null}
        {role === "waiter" ? <Stack.Screen name="WaiterApp" component={WaiterNavigator} /> : null}
        {role === "manager" ? <Stack.Screen name="ManagerApp" component={ManagerNavigator} /> : null}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loaderArea: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  loaderCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
