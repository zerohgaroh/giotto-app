import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useEffect, useMemo, useState } from "react";
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
import { addWaiterOrder, fetchRestaurantData } from "../../api/client";
import { colors } from "../../theme/colors";
import { formatPrice } from "../../theme/format";
import type { Dish, RestaurantData } from "../../types/domain";
import type { WaiterStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<WaiterStackParamList, "WaiterAddOrder">;

export function WaiterAddOrderScreen({ navigation, route }: Props) {
  const tableId = route.params.tableId;
  const [restaurant, setRestaurant] = useState<RestaurantData | null>(null);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<string>("all");
  const [qtyMap, setQtyMap] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [errorText, setErrorText] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchRestaurantData();
        setRestaurant(data);
      } catch (error) {
        setErrorText(error instanceof Error ? error.message : "Не удалось загрузить меню");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

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

  const updateQty = (dish: Dish, delta: number) => {
    setQtyMap((prev) => {
      const next = Math.max(0, (prev[dish.id] || 0) + delta);
      return {
        ...prev,
        [dish.id]: next,
      };
    });
  };

  const submit = async () => {
    if (selected.length === 0 || submitting) return;

    setSubmitting(true);
    try {
      await addWaiterOrder(
        tableId,
        selected.map((item) => ({
          dishId: item.dish.id,
          title: item.dish.nameIt,
          qty: item.qty,
          price: item.dish.price,
        })),
      );
      navigation.goBack();
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "Не удалось добавить заказ");
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
        }
        renderItem={({ item }) => {
          const qty = qtyMap[item.id] || 0;
          return (
            <View style={styles.card}>
              <Image source={{ uri: item.image }} style={styles.image} resizeMode="cover" />
              <Text numberOfLines={2} style={styles.cardTitle}>{item.nameRu}</Text>
              <Text style={styles.cardPrice}>{formatPrice(item.price)}</Text>
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
        <Text style={styles.total}>Итого: {formatPrice(total)}</Text>
        <Pressable disabled={selected.length === 0 || submitting} style={styles.submitBtn} onPress={() => void submit()}>
          <Text style={styles.submitText}>{submitting ? "Добавляем..." : "Добавить в счёт"}</Text>
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
  categoriesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 10,
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
  cardTitle: {
    marginTop: 8,
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
    minHeight: 36,
  },
  cardPrice: {
    marginTop: 4,
    color: colors.navy,
    fontWeight: "700",
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
  },
  total: {
    color: colors.navyDeep,
    fontWeight: "700",
    fontSize: 20,
    marginBottom: 8,
  },
  submitBtn: {
    minHeight: 48,
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
