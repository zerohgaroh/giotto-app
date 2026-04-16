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
import { fetchRestaurantData, updateRestaurantData } from "../../api/client";
import { colors } from "../../theme/colors";
import { formatPrice } from "../../theme/format";
import type { Dish, RestaurantData } from "../../types/domain";

export function ManagerMenuScreen() {
  const [restaurant, setRestaurant] = useState<RestaurantData | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingIds, setSavingIds] = useState<Record<string, boolean>>({});
  const [errorText, setErrorText] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");

  const pull = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchRestaurantData();
      setRestaurant(data);
      setErrorText("");
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "Не удалось загрузить меню");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void pull();
  }, [pull]);

  const dishes = restaurant?.dishes || [];
  const visibleDishes = useMemo(() => {
    return dishes.filter((dish) => activeCategory === "all" || dish.category === activeCategory);
  }, [activeCategory, dishes]);

  const toggleAvailability = async (dish: Dish) => {
    if (!restaurant) return;

    const next: RestaurantData = {
      ...restaurant,
      dishes: restaurant.dishes.map((item) =>
        item.id === dish.id
          ? {
              ...item,
              available: item.available === false,
            }
          : item,
      ),
    };

    setRestaurant(next);
    setSavingIds((prev) => ({ ...prev, [dish.id]: true }));
    try {
      const updated = await updateRestaurantData(next);
      setRestaurant(updated);
      setErrorText("");
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "Не удалось обновить блюдо");
      setRestaurant(restaurant);
    } finally {
      setSavingIds((prev) => ({ ...prev, [dish.id]: false }));
    }
  };

  if (loading || !restaurant) {
    return (
      <SafeAreaView style={[styles.safeArea, styles.center]}>
        <ActivityIndicator color={colors.navy} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.title}>Меню</Text>
        <Text style={styles.subtitle}>Управление стоп-листом в мобильном приложении</Text>
      </View>

      <View style={styles.categoryWrap}>
        <Pressable
          style={[styles.catChip, activeCategory === "all" && styles.catChipActive]}
          onPress={() => setActiveCategory("all")}
        >
          <Text style={[styles.catText, activeCategory === "all" && styles.catTextActive]}>Все</Text>
        </Pressable>
        {restaurant.categories.map((category) => (
          <Pressable
            key={category.id}
            style={[styles.catChip, activeCategory === category.id && styles.catChipActive]}
            onPress={() => setActiveCategory(category.id)}
          >
            <Text style={[styles.catText, activeCategory === category.id && styles.catTextActive]}>
              {category.labelRu}
            </Text>
          </Pressable>
        ))}
      </View>

      {errorText ? <Text style={styles.error}>{errorText}</Text> : null}

      <FlatList
        data={visibleDishes}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          const available = item.available !== false;
          const saving = !!savingIds[item.id];
          return (
            <View style={styles.row}>
              <Image source={{ uri: item.image }} style={styles.thumb} resizeMode="cover" />
              <View style={{ flex: 1 }}>
                <Text style={styles.dishName}>{item.nameRu}</Text>
                <Text style={styles.dishMeta}>{formatPrice(item.price)} · {item.category}</Text>
                <Text style={styles.dishMeta}>{item.nameIt}</Text>
              </View>
              <Pressable
                disabled={saving}
                style={[styles.toggle, available ? styles.toggleOn : styles.toggleOff]}
                onPress={() => void toggleAvailability(item)}
              >
                <Text style={[styles.toggleText, available ? styles.toggleTextOn : styles.toggleTextOff]}>
                  {saving ? "..." : available ? "Активно" : "Стоп"}
                </Text>
              </Pressable>
            </View>
          );
        }}
      />
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
    paddingTop: 14,
  },
  title: {
    fontSize: 30,
    fontWeight: "700",
    color: colors.navyDeep,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 12,
    color: colors.muted,
  },
  categoryWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    marginTop: 10,
    gap: 8,
  },
  catChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    paddingHorizontal: 10,
    paddingVertical: 6,
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
  error: {
    marginTop: 8,
    marginHorizontal: 16,
    color: "#B42318",
  },
  listContent: {
    padding: 12,
    gap: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    padding: 10,
  },
  thumb: {
    width: 62,
    height: 62,
    borderRadius: 10,
    backgroundColor: "#ECE8E0",
  },
  dishName: {
    color: colors.navyDeep,
    fontWeight: "700",
    fontSize: 15,
  },
  dishMeta: {
    marginTop: 2,
    color: colors.muted,
    fontSize: 12,
  },
  toggle: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    minWidth: 72,
    alignItems: "center",
  },
  toggleOn: {
    borderColor: "#CBE6D0",
    backgroundColor: "#EAF3DE",
  },
  toggleOff: {
    borderColor: "#E6C7B8",
    backgroundColor: "#FDEFE8",
  },
  toggleText: {
    fontSize: 11,
    fontWeight: "700",
  },
  toggleTextOn: {
    color: "#2D6A4F",
  },
  toggleTextOff: {
    color: "#B5702A",
  },
});
