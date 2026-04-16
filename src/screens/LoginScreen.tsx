import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useAuth } from "../context/AuthContext";
import { colors } from "../theme/colors";
import { API_BASE_URL } from "../api/client";

type Role = "waiter" | "manager";

export function LoginScreen() {
  const { signInManager, signInWaiter } = useAuth();
  const [role, setRole] = useState<Role>("waiter");
  const [login, setLogin] = useState(role === "waiter" ? "marco" : "manager");
  const [password, setPassword] = useState(role === "waiter" ? "waiter123" : "manager123");
  const [errorText, setErrorText] = useState("");
  const [loading, setLoading] = useState(false);

  const onSelectRole = (nextRole: Role) => {
    setRole(nextRole);
    setLogin(nextRole === "waiter" ? "marco" : "manager");
    setPassword(nextRole === "waiter" ? "waiter123" : "manager123");
    setErrorText("");
  };

  const submit = async () => {
    if (loading) return;
    setLoading(true);
    setErrorText("");
    try {
      if (role === "waiter") {
        await signInWaiter(login, password);
      } else {
        await signInManager(login, password);
      }
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "Не удалось выполнить вход");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.brand}>Giotto Mobile Staff</Text>
        <Text style={styles.title}>Вход в приложение</Text>
        <Text style={styles.subtitle}>UI/UX роли работают в Expo, логика и данные приходят с сервера.</Text>

        <View style={styles.switcher}>
          <Pressable
            onPress={() => onSelectRole("waiter")}
            style={[styles.switchBtn, role === "waiter" && styles.switchBtnActive]}
          >
            <Text style={[styles.switchText, role === "waiter" && styles.switchTextActive]}>Официант</Text>
          </Pressable>
          <Pressable
            onPress={() => onSelectRole("manager")}
            style={[styles.switchBtn, role === "manager" && styles.switchBtnActive]}
          >
            <Text style={[styles.switchText, role === "manager" && styles.switchTextActive]}>Менеджер</Text>
          </Pressable>
        </View>

        <TextInput
          value={login}
          onChangeText={setLogin}
          autoCapitalize="none"
          placeholder="Логин"
          style={styles.input}
          placeholderTextColor="#8A847A"
        />
        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="Пароль"
          style={styles.input}
          placeholderTextColor="#8A847A"
        />

        {errorText ? <Text style={styles.error}>{errorText}</Text> : null}

        <Pressable disabled={loading} style={styles.submitButton} onPress={submit}>
          {loading ? <ActivityIndicator color={colors.white} /> : <Text style={styles.submitText}>Войти</Text>}
        </Pressable>

        <Text style={styles.hint}>API base URL: {API_BASE_URL}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 40,
  },
  brand: {
    fontSize: 12,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: colors.muted,
  },
  title: {
    marginTop: 8,
    fontSize: 30,
    fontWeight: "700",
    color: colors.navyDeep,
  },
  subtitle: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: colors.muted,
  },
  switcher: {
    marginTop: 20,
    flexDirection: "row",
    backgroundColor: "#EFE7D9",
    borderRadius: 14,
    padding: 4,
  },
  switchBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  switchBtnActive: {
    backgroundColor: colors.navy,
  },
  switchText: {
    color: colors.navy,
    fontWeight: "600",
  },
  switchTextActive: {
    color: colors.white,
  },
  input: {
    marginTop: 12,
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
  },
  error: {
    marginTop: 10,
    color: "#B42318",
    fontSize: 13,
  },
  submitButton: {
    marginTop: 16,
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.navy,
    alignItems: "center",
    justifyContent: "center",
  },
  submitText: {
    color: colors.white,
    fontWeight: "700",
    fontSize: 15,
  },
  hint: {
    marginTop: 12,
    color: colors.muted,
    fontSize: 11,
  },
});
