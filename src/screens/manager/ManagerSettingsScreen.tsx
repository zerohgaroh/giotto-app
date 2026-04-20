import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { fetchManagerRestaurantSettings, updateManagerRestaurantSettings } from "../../api/client";
import { useRealtimeRefresh } from "../../realtime/useRealtimeRefresh";
import { colors } from "../../theme/colors";
import type { RealtimeEvent, RestaurantData } from "../../types/domain";

type ProfileDraft = RestaurantData["profile"];

const emptyDraft: ProfileDraft = {
  name: "",
  subtitle: "",
  description: "",
  logo: "",
  banner: "",
  wifiName: "",
  wifiPassword: "",
};

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#8A847A"
        multiline={multiline}
        style={[styles.input, multiline ? styles.inputMultiline : null]}
      />
    </View>
  );
}

function Banner({ tone, text }: { tone: "warning" | "error" | "success"; text: string }) {
  return (
    <View
      style={[
        styles.banner,
        tone === "error" ? styles.bannerError : tone === "success" ? styles.bannerSuccess : styles.bannerWarning,
      ]}
    >
      <Text
        style={[
          styles.bannerText,
          tone === "error" ? styles.bannerErrorText : tone === "success" ? styles.bannerSuccessText : styles.bannerWarningText,
        ]}
      >
        {text}
      </Text>
    </View>
  );
}

export function ManagerSettingsScreen() {
  const [draft, setDraft] = useState<ProfileDraft>(emptyDraft);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [successText, setSuccessText] = useState("");

  const applyProfile = useCallback((next: RestaurantData) => {
    setDraft(next.profile);
  }, []);

  const pull = useCallback(async () => {
    const next = await fetchManagerRestaurantSettings();
    applyProfile(next);
  }, [applyProfile]);

  useEffect(() => {
    setLoading(true);
    void (async () => {
      try {
        await pull();
        setErrorText("");
      } catch {
        setErrorText("Не удалось загрузить настройки ресторана.");
      } finally {
        setLoading(false);
      }
    })();
  }, [pull]);

  const { connected, connecting } = useRealtimeRefresh({
    filter: useCallback((event: RealtimeEvent) => event.type === "restaurant:updated", []),
    refresh: pull,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await pull();
      setErrorText("");
    } catch {
      setErrorText("Не удалось обновить настройки.");
    } finally {
      setRefreshing(false);
    }
  }, [pull]);

  const updateDraft = useCallback((key: keyof ProfileDraft, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setSuccessText("");
  }, []);

  const save = useCallback(async () => {
    if (!draft.name.trim() || !draft.subtitle.trim() || !draft.description.trim() || !draft.logo.trim() || !draft.banner.trim()) {
      setErrorText("Заполни название, подзаголовок, описание, лого и баннер.");
      return;
    }

    setSaving(true);
    try {
      const next = await updateManagerRestaurantSettings(draft);
      applyProfile(next);
      setErrorText("");
      setSuccessText("Настройки сохранены.");
    } catch {
      setErrorText("Не удалось сохранить настройки.");
    } finally {
      setSaving(false);
    }
  }, [applyProfile, draft]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.safeArea, styles.center]}>
        <ActivityIndicator color={colors.navy} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Настройки</Text>
              <Text style={styles.subtitle}>Ресторан, Wi‑Fi и бренд</Text>
            </View>
            <Pressable style={[styles.saveButton, saving ? styles.buttonDisabled : null]} onPress={() => void save()} disabled={saving}>
              <Ionicons name="save-outline" size={18} color={colors.white} />
              <Text style={styles.saveButtonText}>{saving ? "..." : "Сохранить"}</Text>
            </Pressable>
          </View>

          {!connected && !connecting ? <Banner tone="warning" text="Нет live-обновлений. Настройки можно обновить вручную." /> : null}
          {errorText ? <Banner tone="error" text={errorText} /> : null}
          {successText ? <Banner tone="success" text={successText} /> : null}

          <View style={styles.previewCard}>
            {draft.banner ? <Image source={{ uri: draft.banner }} style={styles.bannerPreview} resizeMode="cover" /> : null}
            <View style={styles.previewBody}>
              {draft.logo ? <Image source={{ uri: draft.logo }} style={styles.logoPreview} resizeMode="contain" /> : null}
              <View style={styles.previewCopy}>
                <Text style={styles.previewTitle}>{draft.name || "Название ресторана"}</Text>
                <Text style={styles.previewSubtitle}>{draft.subtitle || "Подзаголовок"}</Text>
              </View>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Профиль ресторана</Text>
            <Field label="Название" value={draft.name} onChangeText={(value) => updateDraft("name", value)} />
            <Field label="Подзаголовок" value={draft.subtitle} onChangeText={(value) => updateDraft("subtitle", value)} />
            <Field
              label="Описание"
              value={draft.description}
              onChangeText={(value) => updateDraft("description", value)}
              multiline
            />
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Бренд</Text>
            <Field label="Logo URL" value={draft.logo} onChangeText={(value) => updateDraft("logo", value)} placeholder="https://..." />
            <Field label="Banner URL" value={draft.banner} onChangeText={(value) => updateDraft("banner", value)} placeholder="https://..." />
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Wi‑Fi для гостей</Text>
            <Field label="Название сети" value={draft.wifiName} onChangeText={(value) => updateDraft("wifiName", value)} />
            <Field label="Пароль" value={draft.wifiPassword} onChangeText={(value) => updateDraft("wifiPassword", value)} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  screen: {
    flex: 1,
  },
  center: {
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    padding: 16,
    gap: 14,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  title: {
    color: colors.navyDeep,
    fontSize: 30,
    fontWeight: "800",
  },
  subtitle: {
    color: colors.muted,
    marginTop: 4,
    fontSize: 14,
  },
  saveButton: {
    minHeight: 46,
    borderRadius: 16,
    backgroundColor: colors.navy,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  saveButtonText: {
    color: colors.white,
    fontWeight: "800",
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  banner: {
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
  },
  bannerText: {
    fontSize: 13,
    fontWeight: "700",
  },
  bannerWarning: {
    backgroundColor: "#FFF7E7",
    borderColor: "#E8D6B5",
  },
  bannerWarningText: {
    color: "#7B5721",
  },
  bannerError: {
    backgroundColor: "#FFF0F0",
    borderColor: "#F0B8B8",
  },
  bannerErrorText: {
    color: "#B42318",
  },
  bannerSuccess: {
    backgroundColor: "#EEF8F1",
    borderColor: "#BBDCC5",
  },
  bannerSuccessText: {
    color: "#25613B",
  },
  previewCard: {
    overflow: "hidden",
    borderRadius: 26,
    borderWidth: 1,
    borderColor: "#DED7CA",
    backgroundColor: colors.white,
  },
  bannerPreview: {
    height: 120,
    width: "100%",
    backgroundColor: "#EFE8D9",
  },
  previewBody: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
  },
  logoPreview: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: "#F7F0E2",
  },
  previewCopy: {
    flex: 1,
  },
  previewTitle: {
    color: colors.navyDeep,
    fontSize: 19,
    fontWeight: "800",
  },
  previewSubtitle: {
    color: colors.muted,
    marginTop: 3,
    fontSize: 13,
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#DED7CA",
    backgroundColor: colors.white,
    padding: 16,
    gap: 12,
  },
  cardTitle: {
    color: colors.navyDeep,
    fontSize: 18,
    fontWeight: "800",
  },
  fieldBlock: {
    gap: 7,
  },
  fieldLabel: {
    color: colors.navyDeep,
    fontSize: 13,
    fontWeight: "800",
  },
  input: {
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: "#FFFDF8",
    paddingHorizontal: 12,
    color: colors.navyDeep,
  },
  inputMultiline: {
    minHeight: 96,
    paddingTop: 12,
    textAlignVertical: "top",
  },
});
