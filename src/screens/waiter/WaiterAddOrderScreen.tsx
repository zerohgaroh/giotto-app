import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  addWaiterOrder,
  fetchRestaurantData,
  fetchWaiterShortcuts,
  updateWaiterShortcuts,
} from "../../api/client";
import type { WaiterStackParamList } from "../../navigation/types";
import {
  clearOrderDraft,
  createMutationKey,
  loadOrderDraft,
  saveOrderDraft,
} from "../../runtime/waiterDrafts";
import { colors } from "../../theme/colors";
import { formatPrice } from "../../theme/format";
import type { Dish, RestaurantData, WaiterQuickOrderPreset, WaiterShortcuts } from "../../types/domain";
import { shouldExitWaiterTableFlow } from "./waiterAccessGuard";

type Props = NativeStackScreenProps<WaiterStackParamList, "WaiterAddOrder">;

function nextPresetTitle(shortcuts: WaiterShortcuts) {
  return `Набор ${shortcuts.quickOrderPresets.length + 1}`;
}

export function WaiterAddOrderScreen({ navigation, route }: Props) {
  const tableId = route.params.tableId;
  const [restaurant, setRestaurant] = useState<RestaurantData | null>(null);
  const [shortcuts, setShortcuts] = useState<WaiterShortcuts | null>(null);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<string>("all");
  const [qtyMap, setQtyMap] = useState<Record<string, number>>({});
  const [draftMutationKey, setDraftMutationKey] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [savingShortcut, setSavingShortcut] = useState(false);
  const [errorText, setErrorText] = useState("");

  const loadScreen = useCallback(async () => {
    try {
      const [restaurantData, shortcutData, draft] = await Promise.all([
        fetchRestaurantData(),
        fetchWaiterShortcuts(),
        loadOrderDraft(tableId),
      ]);
      setRestaurant(restaurantData);
      setShortcuts(shortcutData);
      setQtyMap(draft.qtyMap);
      setDraftMutationKey(draft.mutationKey);
      setErrorText("");
    } catch (error) {
      if (shouldExitWaiterTableFlow(error)) {
        navigation.goBack();
        return;
      }
      setErrorText("Не удалось загрузить меню.");
    } finally {
      setLoading(false);
    }
  }, [navigation, tableId]);

  useEffect(() => {
    void loadScreen();
  }, [loadScreen]);

  const dishes = restaurant?.dishes || [];
  const visible = useMemo(
    () => dishes.filter((dish) => dish.available !== false && (category === "all" || dish.category === category)),
    [category, dishes],
  );

  const selected = useMemo(
    () => dishes.map((dish) => ({ dish, qty: qtyMap[dish.id] || 0 })).filter((item) => item.qty > 0),
    [dishes, qtyMap],
  );

  const total = selected.reduce((sum, item) => sum + item.qty * item.dish.price, 0);

  const favoriteDishes = useMemo(() => {
    if (!shortcuts) return [];
    const favorites = new Set(shortcuts.favoriteDishIds);
    return dishes.filter((dish) => favorites.has(dish.id) && dish.available !== false);
  }, [dishes, shortcuts]);

  useEffect(() => {
    const hasSelection = Object.values(qtyMap).some((qty) => qty > 0);
    if (hasSelection && !draftMutationKey) {
      setDraftMutationKey(createMutationKey("waiter-order"));
      return;
    }
    if (!hasSelection && draftMutationKey) {
      setDraftMutationKey(undefined);
    }
  }, [draftMutationKey, qtyMap]);

  useEffect(() => {
    const hasSelection = Object.values(qtyMap).some((qty) => qty > 0);
    if (!hasSelection && !draftMutationKey) {
      void clearOrderDraft(tableId);
      return;
    }
    void saveOrderDraft(tableId, { qtyMap, mutationKey: draftMutationKey });
  }, [draftMutationKey, qtyMap, tableId]);

  const updateQty = (dish: Dish, delta: number) => {
    setQtyMap((prev) => {
      const nextQty = Math.max(0, (prev[dish.id] || 0) + delta);
      return {
        ...prev,
        [dish.id]: nextQty,
      };
    });
  };

  const applyPreset = (preset: WaiterQuickOrderPreset) => {
    setQtyMap((prev) => {
      const next = { ...prev };
      for (const item of preset.items) {
        const dish = dishes.find((candidate) => candidate.id === item.dishId && candidate.available !== false);
        if (!dish) continue;
        next[item.dishId] = (next[item.dishId] || 0) + item.qty;
      }
      return next;
    });
  };

  const updateShortcutSet = async (next: WaiterShortcuts) => {
    setSavingShortcut(true);
    try {
      const updated = await updateWaiterShortcuts(next);
      setShortcuts(updated);
      setErrorText("");
    } catch {
      setErrorText("Не удалось сохранить.");
    } finally {
      setSavingShortcut(false);
    }
  };

  const toggleFavorite = async (dishId: string) => {
    if (!shortcuts) return;
    const favorites = shortcuts.favoriteDishIds.includes(dishId)
      ? shortcuts.favoriteDishIds.filter((id) => id !== dishId)
      : [...shortcuts.favoriteDishIds, dishId];

    await updateShortcutSet({
      ...shortcuts,
      favoriteDishIds: favorites,
    });
  };

  const saveCurrentPreset = async () => {
    if (!shortcuts || selected.length === 0) return;

    const preset: WaiterQuickOrderPreset = {
      id: createMutationKey("preset"),
      title: nextPresetTitle(shortcuts),
      items: selected.map((item) => ({
        dishId: item.dish.id,
        qty: item.qty,
      })),
    };

    await updateShortcutSet({
      ...shortcuts,
      quickOrderPresets: [...shortcuts.quickOrderPresets, preset].slice(-8),
    });
  };

  const removePreset = async (presetId: string) => {
    if (!shortcuts) return;

    await updateShortcutSet({
      ...shortcuts,
      quickOrderPresets: shortcuts.quickOrderPresets.filter((preset) => preset.id !== presetId),
    });
  };

  const submit = async () => {
    if (selected.length === 0 || submitting) return;

    const mutationKey = draftMutationKey ?? createMutationKey("waiter-order");
    setSubmitting(true);
    setDraftMutationKey(mutationKey);
    try {
      await addWaiterOrder(
        tableId,
        selected.map((item) => ({
          dishId: item.dish.id,
          title: item.dish.nameIt,
          qty: item.qty,
          price: item.dish.price,
        })),
        mutationKey,
      );
      await clearOrderDraft(tableId);
      setQtyMap({});
      setDraftMutationKey(undefined);
      navigation.goBack();
    } catch (error) {
      if (shouldExitWaiterTableFlow(error)) {
        navigation.goBack();
        return;
      }
      setErrorText("Не удалось добавить позиции.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.safeArea, styles.center]}>
        <ActivityIndicator color={colors.navy} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Добавить в счёт</Text>
          <Text style={styles.subtitle}>Стол {tableId}</Text>
        </View>
        <Pressable style={styles.closeBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.closeText}>Закрыть</Text>
        </Pressable>
      </View>

      <FlatList
        data={visible}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.headerContent}>
            {favoriteDishes.length > 0 ? (
              <View style={styles.featureCard}>
                <Text style={styles.sectionTitle}>Избранное</Text>
                <View style={styles.chipsRow}>
                  {favoriteDishes.map((dish) => (
                    <Pressable key={dish.id} style={styles.favoriteChip} onPress={() => updateQty(dish, 1)}>
                      <Text style={styles.favoriteChipText}>{dish.nameRu}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}

            {shortcuts?.quickOrderPresets?.length ? (
              <View style={styles.featureCard}>
                <Text style={styles.sectionTitle}>Наборы</Text>
                <View style={styles.stack}>
                  {shortcuts.quickOrderPresets.map((preset) => (
                    <View key={preset.id} style={styles.presetRow}>
                      <View style={styles.flexOne}>
                        <Text style={styles.presetTitle}>{preset.title}</Text>
                        <Text style={styles.presetMeta}>{preset.items.length} поз.</Text>
                      </View>
                      <Pressable style={styles.smallOutlineButton} onPress={() => applyPreset(preset)}>
                        <Text style={styles.smallOutlineButtonText}>Выбрать</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.smallOutlineButton, savingShortcut && styles.buttonDisabled]}
                        disabled={savingShortcut}
                        onPress={() => void removePreset(preset.id)}
                      >
                        <Text style={styles.smallOutlineButtonText}>Удалить</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            <View style={styles.featureCard}>
              <Text style={styles.sectionTitle}>Категории</Text>
              <View style={styles.categoriesRow}>
                <Pressable
                  style={[styles.catChip, category === "all" && styles.catChipActive]}
                  onPress={() => setCategory("all")}
                >
                  <Text style={[styles.catText, category === "all" && styles.catTextActive]}>Все</Text>
                </Pressable>
                {(restaurant?.categories || []).map((cat) => (
                  <Pressable
                    key={cat.id}
                    style={[styles.catChip, category === cat.id && styles.catChipActive]}
                    onPress={() => setCategory(cat.id)}
                  >
                    <Text style={[styles.catText, category === cat.id && styles.catTextActive]}>{cat.labelRu}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>
        }
        renderItem={({ item }) => {
          const qty = qtyMap[item.id] || 0;
          const isFavorite = shortcuts?.favoriteDishIds.includes(item.id) ?? false;
          return (
            <View style={styles.card}>
              <Image source={{ uri: item.image }} style={styles.image} resizeMode="cover" />
              <View style={styles.cardHead}>
                <Text numberOfLines={2} style={styles.cardTitle}>
                  {item.nameRu}
                </Text>
                <Pressable
                  style={[
                    styles.favoriteToggle,
                    isFavorite && styles.favoriteToggleActive,
                    savingShortcut && styles.buttonDisabled,
                  ]}
                  disabled={savingShortcut}
                  onPress={() => void toggleFavorite(item.id)}
                >
                  <Text style={[styles.favoriteToggleText, isFavorite && styles.favoriteToggleTextActive]}>
                    {isFavorite ? "В избранном" : "В избранное"}
                  </Text>
                </Pressable>
              </View>
              <Text style={styles.cardPrice}>{formatPrice(item.price)}</Text>
              <Text numberOfLines={2} style={styles.cardMeta}>
                {item.description}
              </Text>
              <View style={styles.qtyRow}>
                <Pressable style={styles.qtyBtn} onPress={() => updateQty(item, -1)}>
                  <Text style={styles.qtyBtnText}>-</Text>
                </Pressable>
                <Text style={styles.qtyValue}>{qty}</Text>
                <Pressable style={styles.qtyBtn} onPress={() => updateQty(item, 1)}>
                  <Text style={styles.qtyBtnText}>+</Text>
                </Pressable>
              </View>
            </View>
          );
        }}
      />

      {errorText ? <Text style={styles.error}>{errorText}</Text> : null}

      <View style={styles.footer}>
        <View style={styles.footerRow}>
          <Text style={styles.total}>Итого: {formatPrice(total)}</Text>
          <Pressable
            style={[styles.secondaryFooterBtn, (selected.length === 0 || savingShortcut) && styles.buttonDisabled]}
            disabled={selected.length === 0 || savingShortcut}
            onPress={() => void saveCurrentPreset()}
          >
            <Text style={styles.secondaryFooterText}>Сохранить набор</Text>
          </Pressable>
        </View>
        <Pressable
          disabled={selected.length === 0 || submitting}
          style={[styles.submitBtn, (selected.length === 0 || submitting) && styles.submitBtnDisabled]}
          onPress={() => void submit()}
        >
          <Text style={styles.submitText}>{submitting ? "..." : "Добавить"}</Text>
        </Pressable>
      </View>
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
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: {
    color: colors.navyDeep,
    fontSize: 24,
    fontWeight: "700",
  },
  subtitle: {
    color: colors.muted,
    marginTop: 4,
  },
  closeBtn: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.white,
  },
  closeText: {
    color: colors.navy,
    fontWeight: "600",
  },
  headerContent: {
    gap: 12,
    marginBottom: 12,
  },
  featureCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    padding: 12,
    gap: 10,
  },
  sectionTitle: {
    color: colors.navyDeep,
    fontWeight: "700",
    fontSize: 16,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  favoriteChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#E8D6B5",
    backgroundColor: "#FFF8EC",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  favoriteChipText: {
    color: "#8A6A33",
    fontWeight: "700",
    fontSize: 12,
  },
  stack: {
    gap: 8,
  },
  presetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
  },
  flexOne: {
    flex: 1,
  },
  presetTitle: {
    color: colors.navyDeep,
    fontWeight: "600",
  },
  presetMeta: {
    color: colors.muted,
    fontSize: 12,
  },
  categoriesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  catChip: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: colors.white,
  },
  catChipActive: {
    borderColor: colors.navy,
    backgroundColor: colors.navy,
  },
  catText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
  },
  catTextActive: {
    color: colors.white,
  },
  listContent: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 140,
  },
  row: {
    gap: 8,
  },
  card: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    padding: 10,
    marginBottom: 8,
  },
  image: {
    width: "100%",
    height: 104,
    borderRadius: 10,
    backgroundColor: "#ECE8E0",
  },
  cardHead: {
    marginTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
  },
  cardTitle: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
    minHeight: 36,
  },
  favoriteToggle: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.white,
  },
  favoriteToggleActive: {
    borderColor: colors.gold,
    backgroundColor: "#FFF8EC",
  },
  favoriteToggleText: {
    color: colors.navy,
    fontSize: 11,
    fontWeight: "700",
  },
  favoriteToggleTextActive: {
    color: "#8A6A33",
  },
  cardPrice: {
    marginTop: 4,
    color: colors.navy,
    fontWeight: "700",
  },
  cardMeta: {
    marginTop: 4,
    color: colors.muted,
    fontSize: 12,
    minHeight: 34,
  },
  qtyRow: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 10,
    backgroundColor: colors.navy,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  qtyBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  qtyBtnText: {
    color: colors.white,
    fontSize: 18,
    fontWeight: "700",
    marginTop: -1,
  },
  qtyValue: {
    color: colors.white,
    fontWeight: "700",
    fontSize: 14,
  },
  smallOutlineButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: colors.white,
  },
  smallOutlineButtonText: {
    color: colors.navy,
    fontWeight: "600",
    fontSize: 12,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  error: {
    paddingHorizontal: 16,
    color: "#B42318",
    marginBottom: 8,
  },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.cream,
    gap: 8,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  total: {
    color: colors.navyDeep,
    fontWeight: "700",
    fontSize: 20,
    flex: 1,
  },
  secondaryFooterBtn: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  secondaryFooterText: {
    color: colors.navy,
    fontWeight: "600",
  },
  submitBtn: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: colors.navy,
    alignItems: "center",
    justifyContent: "center",
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitText: {
    color: colors.white,
    fontWeight: "700",
    fontSize: 15,
  },
});
