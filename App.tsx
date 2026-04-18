import "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AuthProvider } from "./src/context/AuthContext";
import { AppNavigator } from "./src/navigation/AppNavigator";
import { StaffRuntime } from "./src/runtime/StaffRuntime";

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <StatusBar style="dark" />
        <StaffRuntime />
        <AppNavigator />
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
