import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { fetchRestaurantData, fetchWaiterShiftSummary, fetchWaiterShortcuts, updateWaiterShortcuts } from "../../api/client";
import type { WaiterTabParamList } from "../../navigation/types";
import { useWaiterRealtime } from "../../realtime/useWaiterRealtime";
import { colors } from "../../theme/colors";
import { formatDurationFrom } from "../../theme/format";
import type { RestaurantData, WaiterShiftSummary, WaiterShortcuts } from "../../types/domain";

type Props = BottomTabScreenProps<WaiterTabParamList, "WaiterShift">;

const EMPTY_SHORTCUTS: WaiterShortcuts = {
  favoriteDishIds: [],
  noteTemplates: [],
  quickOrderPresets: [],
};

export function WaiterShiftScreen(_props: Props) {
  const [summary, setSummary] = useState<WaiterShiftSummary | null>(null);
  const [shortcuts, setShortcuts] = useState<WaiterShortcuts>(EMPTY_SHORTCUTS);
  const [restaurant, setRestaurant] = useState<RestaurantData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [templateDraft, setTemplateDraft] = useState("");
  const [now, setNow] = useState(Date.now());

  const pull = useCallback(async (withLoader = false) => {
    if (withLoader) setLoading(true);
    try {
      const [nextSummary, nextShortcuts, nextRestaurant] = await Promise.all([
        fetchWaiterShiftSummary(),
        fetchWaiterShortcuts(),
        fetchRestaurantData(),
      ]);
      setSummary(nextSummary);
      setShortcuts(nextShortcuts);
      setRestaurant(nextRestaurant);
      setErrorText("");
    } catch {
      setErrorText("Не удалось загрузить смену.");
    } finally {
      if (withLoader) setLoading(false);
    }
  }, []);

  const handleRealtimeEvent = useCallback(() => {
    void pull(false);
  }, [pull]);

  const { connected } = useWaiterRealtime(handleRealtimeEvent);

  useEffect(() => {
    void pull(true);
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [pull]);

  const onRefresh = async () => {
    setRefreshing(true);
    await pull(false);
    setRefreshing(false);
  };

  const favoriteNames = useMemo(() => {
    const dishes = restaurant?.dishes ?? [];
    return shortcuts.favoriteDishIds
      .map((dishId) => dishes.find((dish) => dish.id === dishId))
      .filter((dish): dish is NonNullable<typeof dish> => !!dish)
      .map((dish) => dish.nameRu);
  }, [restaurant?.dishes, shortcuts.favoriteDishIds]);

  const saveShortcuts = async (next: WaiterShortcuts) => {
    setSaving(true);
    try {
      const saved = await updateWaiterShortcuts(next);
      setShortcuts(saved);
      setErrorText("");
    } catch {
      setErrorText("Не удалось сохранить.");
    } finally {
      setSaving(false);
    }
  };

  const addTemplate = async () => {
    const nextTemplate = templateDraft.trim();
    if (!nextTemplate) return;
    await saveShortcuts({
      ...shortcuts,
      noteTemplates: [...shortcuts.noteTemplates, nextTemplate],
    });
    setTemplateDraft("");
  };

  if (loading && !summary) {
    return (
      <SafeAreaView style={[styles.safeArea, styles.center]}>
        <ActivityIndicator color={colors.navy} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.header}>
          <Text style={styles.label}>Официант</Text>
          <Text style={styles.title}>Смена</Text>
          {summary ? <Text style={styles.subtitle}>Идёт {formatDurationFrom(summary.shiftStartedAt, now)}</Text> : null}
        </View>

        {!connected ? <View style={styles.banner}><Text style={styles.bannerText}>Нет связи.</Text></View> : null}

        {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}

        {summary ? (
          <View style={styles.grid}>
            <View style={styles.metricCard}>
              <Text style={styles.metricValue}>{summary.tasksHandled}</Text>
              <Text style={styles.metricLabel}>Закрыто задач</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricValue}>{summary.avgResponseSec}s</Text>
              <Text style={styles.metricLabel}>Средний ответ</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricValue}>{summary.activeTablesCount}</Text>
              <Text style={styles.metricLabel}>Активные столы</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricValue}>{summary.waiterOrdersCount}</Text>
              <Text style={styles.metricLabel}>Добавлено позиций</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricValue}>{summary.serviceCompletedCount}</Text>
              <Text style={styles.metricLabel}>Обслужено</Text>
            </View>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Избранное</Text>
          {favoriteNames.length > 0 ? (
            <View style={styles.chipsRow}>
              {favoriteNames.map((dishName) => (
                <View key={dishName} style={styles.chip}>
                  <Text style={styles.chipText}>{dishName}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.helperText}>Пусто</Text>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Шаблоны заметок</Text>
          <View style={styles.templateComposer}>
            <TextInput
              value={templateDraft}
              onChangeText={setTemplateDraft}
              placeholder="Новый шаблон"
              placeholderTextColor="#8A847A"
              style={styles.input}
            />
            <Pressable
              style={[styles.primaryButton, saving && styles.buttonDisabled]}
              disabled={saving}
              onPress={() => void addTemplate()}
            >
              <Text style={styles.primaryButtonText}>{saving ? "..." : "Добавить"}</Text>
            </Pressable>
          </View>

          {shortcuts.noteTemplates.length > 0 ? (
            <View style={styles.templateList}>
              {shortcuts.noteTemplates.map((template) => (
                <View key={template} style={styles.templateRow}>
                  <Text style={styles.templateText}>{template}</Text>
                  <Pressable
                    style={styles.secondaryButton}
                    onPress={() =>
                      void saveShortcuts({
                        ...shortcuts,
                        noteTemplates: shortcuts.noteTemplates.filter((item) => item !== template),
                      })
                    }
                  >
                    <Text style={styles.secondaryButtonText}>Удалить</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.helperText}>Пусто</Text>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Быстрые наборы</Text>
          {shortcuts.quickOrderPresets.length > 0 ? (
            <View style={styles.templateList}>
              {shortcuts.quickOrderPresets.map((preset) => (
                <View key={preset.id} style={styles.templateRow}>
                  <View style={styles.templateCopy}>
                    <Text style={styles.templateText}>{preset.title}</Text>
                    <Text style={styles.helperText}>{preset.items.length} поз.</Text>
                  </View>
                  <Pressable
                    style={styles.secondaryButton}
                    onPress={() =>
                      void saveShortcuts({
                        ...shortcuts,
                        quickOrderPresets: shortcuts.quickOrderPresets.filter((item) => item.id !== preset.id),
                      })
                    }
                  >
                    <Text style={styles.secondaryButtonText}>Удалить</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.helperText}>Пусто</Text>
          )}
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
  center: {
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    padding: 16,
    paddingBottom: 30,
    gap: 12,
  },
  header: {
    gap: 4,
  },
  label: {
    textTransform: "uppercase",
    fontSize: 11,
    color: colors.muted,
    letterSpacing: 1,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: colors.navyDeep,
  },
  subtitle: {
    color: colors.navy,
    fontWeight: "600",
  },
  banner: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E8D6B5",
    backgroundColor: "#FFF8EC",
    padding: 10,
  },
  bannerText: {
    color: "#8A6A33",
    fontSize: 12,
    lineHeight: 18,
  },
  errorText: {
    color: "#B42318",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  metricCard: {
    width: "48%",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    padding: 12,
  },
  metricValue: {
    color: colors.navyDeep,
    fontSize: 22,
    fontWeight: "700",
  },
  metricLabel: {
    marginTop: 4,
    color: colors.muted,
    fontSize: 12,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    padding: 14,
    gap: 10,
  },
  cardTitle: {
    color: colors.navyDeep,
    fontSize: 18,
    fontWeight: "700",
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderRadius: 999,
    backgroundColor: "#F6ECE0",
    borderWidth: 1,
    borderColor: "#E8D6B5",
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipText: {
    color: "#8A6A33",
    fontWeight: "600",
    fontSize: 12,
  },
  helperText: {
    color: colors.muted,
    fontSize: 12,
  },
  templateComposer: {
    flexDirection: "row",
    gap: 8,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    backgroundColor: colors.white,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
  },
  primaryButton: {
    borderRadius: 12,
    backgroundColor: colors.navy,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  primaryButtonText: {
    color: colors.white,
    fontWeight: "700",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  templateList: {
    gap: 10,
  },
  templateRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
    alignItems: "center",
  },
  templateCopy: {
    flex: 1,
  },
  templateText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
  },
  secondaryButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  secondaryButtonText: {
    color: colors.navy,
    fontWeight: "600",
    fontSize: 12,
  },
});
