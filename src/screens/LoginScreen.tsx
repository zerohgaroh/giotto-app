import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { colors } from "../theme/colors";

const logo = require("../../assets/brand-logo-clean.png");

export function LoginScreen() {
  const { signIn } = useAuth();
  const { width, height } = useWindowDimensions();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [errorText, setErrorText] = useState("");
  const [loading, setLoading] = useState(false);

  const isWide = width >= 980;
  const isCompactHeight = height < 760;

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
        setErrorText("Сервер недоступен.");
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
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            isWide ? styles.scrollContentWide : null,
            isCompactHeight ? styles.scrollContentCompact : null,
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.shell, isWide ? styles.shellWide : null]}>
            {isWide ? (
              <View style={styles.heroPanel}>
                <View style={styles.heroBadge}>
                  <Image source={logo} style={styles.heroBadgeLogo} />
                  <Text style={styles.heroBadgeText}>GIOTTO</Text>
                </View>

                <View style={styles.heroCopy}>
                  <Text style={styles.heroTitle}>Приложение команды</Text>
                  <Text style={styles.heroText}>
                    Работа с залом, меню и сменой в одном приложении.
                  </Text>
                </View>
              </View>
            ) : null}

            <View style={styles.card}>
              <View style={styles.cardTop}>
                <View style={styles.logoWrap}>
                  <Image source={logo} style={styles.logo} />
                </View>
                <Text style={styles.brand}>GIOTTO</Text>
                <Text style={styles.title}>Вход</Text>
                <Text style={styles.subtitle}>Войди в рабочий аккаунт</Text>
              </View>

              <View style={styles.fieldsWrap}>
                <Text style={styles.fieldLabel}>Логин</Text>
                <TextInput
                  value={login}
                  onChangeText={setLogin}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="Введите логин"
                  placeholderTextColor="#8A847A"
                  style={styles.input}
                />

                <Text style={[styles.fieldLabel, styles.topGap]}>Пароль</Text>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  placeholder="Введите пароль"
                  placeholderTextColor="#8A847A"
                  style={styles.input}
                />
              </View>

              {errorText ? <Text style={styles.error}>{errorText}</Text> : null}

              <Pressable
                disabled={loading}
                style={({ pressed }) => [styles.submitButton, pressed ? styles.submitButtonPressed : null]}
                onPress={() => void submit()}
              >
                {loading ? <ActivityIndicator color={colors.white} /> : <Text style={styles.submitText}>Войти</Text>}
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 18,
    paddingVertical: 24,
  },
  scrollContentWide: {
    paddingHorizontal: 32,
    paddingVertical: 32,
  },
  scrollContentCompact: {
    justifyContent: "flex-start",
    paddingTop: 20,
    paddingBottom: 20,
  },
  shell: {
    width: "100%",
    maxWidth: 1120,
    alignSelf: "center",
    justifyContent: "center",
  },
  shellWide: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 28,
  },
  heroPanel: {
    flex: 1,
    minHeight: 560,
    borderRadius: 32,
    paddingHorizontal: 34,
    paddingVertical: 34,
    justifyContent: "space-between",
    backgroundColor: "#F4EEDF",
    borderWidth: 1,
    borderColor: "#E4DCCF",
  },
  heroBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: "#E6DED0",
  },
  heroBadgeLogo: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  heroBadgeText: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 1.2,
    color: colors.navyDeep,
  },
  heroCopy: {
    maxWidth: 420,
    gap: 12,
  },
  heroTitle: {
    fontSize: 42,
    lineHeight: 48,
    fontWeight: "800",
    color: colors.navyDeep,
  },
  heroText: {
    fontSize: 18,
    lineHeight: 28,
    color: colors.muted,
  },
  card: {
    width: "100%",
    maxWidth: 440,
    alignSelf: "center",
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "#E3DCCF",
    backgroundColor: colors.white,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 20,
    shadowColor: "#0D2B6B",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.08,
    shadowRadius: 26,
    elevation: 4,
  },
  cardTop: {
    alignItems: "center",
  },
  logoWrap: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: colors.navy,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0D2B6B",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 14,
    elevation: 6,
  },
  logo: {
    width: 54,
    height: 54,
    borderRadius: 27,
  },
  brand: {
    marginTop: 14,
    textAlign: "center",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 1.8,
    color: colors.muted,
    fontWeight: "700",
  },
  title: {
    marginTop: 8,
    textAlign: "center",
    fontSize: 34,
    lineHeight: 38,
    fontWeight: "800",
    color: colors.navyDeep,
  },
  subtitle: {
    marginTop: 8,
    textAlign: "center",
    fontSize: 15,
    lineHeight: 22,
    color: colors.muted,
  },
  fieldsWrap: {
    marginTop: 24,
  },
  fieldLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 8,
  },
  topGap: {
    marginTop: 14,
  },
  input: {
    minHeight: 52,
    backgroundColor: "#FFFCF7",
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
  },
  error: {
    marginTop: 14,
    color: "#C92A1C",
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  submitButton: {
    marginTop: 18,
    minHeight: 54,
    borderRadius: 16,
    backgroundColor: colors.navy,
    alignItems: "center",
    justifyContent: "center",
  },
  submitButtonPressed: {
    opacity: 0.92,
  },
  submitText: {
    color: colors.white,
    fontWeight: "800",
    fontSize: 16,
  },
});
