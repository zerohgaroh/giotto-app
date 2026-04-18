import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { colors } from "../theme/colors";

const logo = require("../../assets/icon.png");

export function LoginScreen() {
  const { signIn } = useAuth();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [errorText, setErrorText] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (loading) return;
    if (!login.trim() || !password) {
      setErrorText("Введите логин и пароль.");
      return;
    }

    setLoading(true);
    setErrorText("");

    try {
      await signIn(login, password);
    } catch (error) {
      if (error instanceof ApiError && error.code === "network") {
        setErrorText("Нет соединения.");
      } else if (error instanceof ApiError && error.status === 401) {
        setErrorText("Неверный логин или пароль.");
      } else {
        setErrorText("Не удалось войти.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.bgTopGlow} />
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <View style={styles.logoWrap}>
            <Image source={logo} style={styles.logo} />
          </View>

          <Text style={styles.brand}>Giotto</Text>
          <Text style={styles.title}>Вход</Text>

          <View style={styles.fieldsWrap}>
            <Text style={styles.fieldLabel}>Логин</Text>
            <TextInput
              value={login}
              onChangeText={setLogin}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Логин"
              style={styles.input}
              placeholderTextColor="#8A847A"
            />

            <Text style={[styles.fieldLabel, styles.topGap]}>Пароль</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="Пароль"
              style={styles.input}
              placeholderTextColor="#8A847A"
            />
          </View>

          {errorText ? <Text style={styles.error}>{errorText}</Text> : null}

          <Pressable disabled={loading} style={styles.submitButton} onPress={() => void submit()}>
            {loading ? <ActivityIndicator color={colors.white} /> : <Text style={styles.submitText}>Войти</Text>}
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  bgTopGlow: {
    position: "absolute",
    top: -140,
    left: -120,
    right: -120,
    height: 320,
    borderRadius: 220,
    backgroundColor: "#E9D8B8",
    opacity: 0.35,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 18,
    paddingVertical: 24,
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#E3DCCF",
    backgroundColor: colors.white,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 16,
    shadowColor: "#0D2B6B",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 4,
  },
  logoWrap: {
    width: 74,
    height: 74,
    borderRadius: 37,
    alignSelf: "center",
    backgroundColor: colors.navy,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0D2B6B",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 6,
  },
  logo: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  brand: {
    marginTop: 12,
    textAlign: "center",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 1.8,
    color: colors.muted,
    fontWeight: "600",
  },
  title: {
    marginTop: 6,
    textAlign: "center",
    fontSize: 30,
    fontWeight: "700",
    color: colors.navyDeep,
  },
  fieldsWrap: {
    marginTop: 18,
  },
  fieldLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 6,
  },
  topGap: {
    marginTop: 10,
  },
  input: {
    backgroundColor: "#FFFCF7",
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
    lineHeight: 18,
  },
  submitButton: {
    marginTop: 14,
    minHeight: 50,
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
});
