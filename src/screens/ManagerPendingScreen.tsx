import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../context/AuthContext";
import { colors } from "../theme/colors";

export function ManagerPendingScreen() {
  const { signOut } = useAuth();

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <View style={styles.card}>
        <Text style={styles.label}>Giotto</Text>
        <Text style={styles.title}>Скоро</Text>
        <Pressable style={styles.button} onPress={() => void signOut()}>
          <Text style={styles.buttonText}>Выйти</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.cream,
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    padding: 18,
  },
  label: {
    textTransform: "uppercase",
    letterSpacing: 1.4,
    fontSize: 11,
    color: colors.muted,
    fontWeight: "700",
  },
  title: {
    marginTop: 8,
    fontSize: 28,
    fontWeight: "700",
    color: colors.navyDeep,
  },
  button: {
    marginTop: 18,
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: colors.navy,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    color: colors.white,
    fontWeight: "700",
    fontSize: 15,
  },
});
