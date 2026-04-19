import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { addWaiterOrder, fetchRestaurantData } from "../../api/client";
import type { WaiterStackParamList } from "../../navigation/types";
import {
  clearOrderDraft,
  createMutationKey,
  loadOrderDraft,
  saveOrderDraft,
} from "../../runtime/waiterDrafts";
import { colors } from "../../theme/colors";
import { formatPrice } from "../../theme/format";
import type { Dish, RestaurantData } from "../../types/domain";
import { shouldExitWaiterTableFlow } from "./waiterAccessGuard";

type Props = NativeStackScreenProps<WaiterStackParamList, "WaiterAddOrder">;

export function WaiterAddOrderScreen({ navigation, route }: Props) {
  const tableId = route.params.tableId;
  const [restaurant, setRestaurant] = useState<RestaurantData | null>(null);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<string>("all");
  const [qtyMap, setQtyMap] = useState<Record<string, number>>({});
  const [draftMutationKey, setDraftMutationKey] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [errorText, setErrorText] = useState("");

  const loadScreen = useCallback(async () => {
    try {
      const [restaurantData, draft] = await Promise.all([
        fetchRestaurantData(),
        loadOrderDraft(tableId),
      ]);
      setRestaurant(restaurantData);
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
      <SafeAreaView style={[styles.safeArea, styles.center]} edges={["top"]}>
        <ActivityIndicator color={colors.navy} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
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
          <View style={styles.categoryCard}>
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
        }
        renderItem={({ item }) => {
          const qty = qtyMap[item.id] || 0;
          return (
            <View style={styles.card}>
              <Image source={{ uri: item.image }} style={styles.image} resizeMode="cover" />
              <View style={styles.cardBody}>
                <Text numberOfLines={2} style={styles.cardTitle}>
                  {item.nameRu}
                </Text>
                <Text style={styles.priceLabel}>Цена</Text>
                <Text style={styles.cardPrice}>{formatPrice(item.price)}</Text>
                <Pressable style={styles.addButton} onPress={() => updateQty(item, 1)}>
                  <Text style={styles.addButtonText}>+ ДОБАВИТЬ{qty > 0 ? ` · ${qty}` : ""}</Text>
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
          <View style={styles.counterPill}>
            <Text style={styles.counterPillText}>Позиций: {selected.reduce((sum, item) => sum + item.qty, 0)}</Text>
          </View>
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
    paddingTop: 10,
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
    fontSize: 16,
  },
  closeBtn: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.white,
  },
  closeText: {
    color: colors.navy,
    fontWeight: "600",
    fontSize: 16,
  },
  categoryCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    padding: 12,
    gap: 10,
    marginBottom: 12,
  },
  sectionTitle: {
    color: colors.navyDeep,
    fontWeight: "700",
    fontSize: 18,
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
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: colors.white,
  },
  catChipActive: {
    borderColor: colors.navy,
    backgroundColor: colors.navy,
  },
  catText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "600",
  },
  catTextActive: {
    color: colors.white,
  },
  listContent: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 160,
  },
  row: {
    gap: 8,
  },
  card: {
    flex: 1,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    overflow: "hidden",
    marginBottom: 10,
  },
  image: {
    width: "100%",
    height: 180,
    backgroundColor: "#ECE8E0",
  },
  cardBody: {
    padding: 12,
    gap: 6,
  },
  cardTitle: {
    color: colors.navyDeep,
    fontSize: 18,
    fontWeight: "600",
    minHeight: 56,
  },
  priceLabel: {
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 1,
    fontSize: 11,
  },
  cardPrice: {
    color: colors.navy,
    fontWeight: "700",
    fontSize: 19,
  },
  addButton: {
    marginTop: 8,
    minHeight: 48,
    borderRadius: 18,
    backgroundColor: colors.navy,
    alignItems: "center",
    justifyContent: "center",
  },
  addButtonText: {
    color: colors.white,
    fontWeight: "700",
    fontSize: 18,
    letterSpacing: 1,
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
    gap: 10,
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
    fontSize: 22,
    flex: 1,
  },
  counterPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  counterPillText: {
    color: colors.navy,
    fontWeight: "600",
  },
  submitBtn: {
    minHeight: 52,
    borderRadius: 14,
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
    fontSize: 18,
  },
});
