import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  createManagerCategory,
  createManagerDish,
  deleteManagerCategory,
  deleteManagerDish,
  fetchManagerMenu,
  reorderManagerMenu,
  toggleManagerDishAvailability,
  updateManagerCategory,
  updateManagerDish,
} from "../../api/client";
import { useStaffRealtime } from "../../realtime/useStaffRealtime";
import { colors } from "../../theme/colors";
import { formatPrice } from "../../theme/format";
import type { Dish, ManagerMenuSnapshot, MenuCategory } from "../../types/domain";

type CategoryEditor = {
  id?: string;
  labelRu: string;
  icon: string;
};

type DishEditor = {
  id?: string;
  categoryId: string;
  nameRu: string;
  nameIt: string;
  description: string;
  price: string;
  image: string;
  portion: string;
  energyKcal: string;
  badgeLabel: string;
  badgeTone: string;
  highlight: boolean;
  available: boolean;
};

function emptyCategoryEditor(): CategoryEditor {
  return {
    labelRu: "",
    icon: "",
  };
}

function emptyDishEditor(categoryId: string): DishEditor {
  return {
    categoryId,
    nameRu: "",
    nameIt: "",
    description: "",
    price: "",
    image: "",
    portion: "",
    energyKcal: "",
    badgeLabel: "",
    badgeTone: "",
    highlight: false,
    available: true,
  };
}

export function ManagerMenuScreen() {
  const [menu, setMenu] = useState<ManagerMenuSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [activeCategoryId, setActiveCategoryId] = useState<string>("all");
  const [categoryEditor, setCategoryEditor] = useState<CategoryEditor>(emptyCategoryEditor());
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [dishEditor, setDishEditor] = useState<DishEditor>(emptyDishEditor(""));
  const [dishModalOpen, setDishModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const pull = useCallback(async () => {
    const next = await fetchManagerMenu();
    setMenu(next);
    if (activeCategoryId !== "all" && !next.categories.some((category) => category.id === activeCategoryId)) {
      setActiveCategoryId("all");
    }
    if (!dishEditor.categoryId && next.categories[0]) {
      setDishEditor((current) => ({ ...current, categoryId: next.categories[0].id }));
    }
  }, [activeCategoryId, dishEditor.categoryId]);

  useEffect(() => {
    setLoading(true);
    void (async () => {
      try {
        await pull();
        setErrorText("");
      } catch {
        setErrorText("Не удалось загрузить меню.");
      } finally {
        setLoading(false);
      }
    })();
  }, [pull]);

  useStaffRealtime(
    useCallback((event) => {
      if (event.type === "menu:changed") {
        void pull();
      }
    }, [pull]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await pull();
      setErrorText("");
    } catch {
      setErrorText("Не удалось обновить меню.");
    } finally {
      setRefreshing(false);
    }
  };

  const visibleDishes = useMemo(() => {
    const dishes = menu?.dishes ?? [];
    return dishes.filter((dish) => activeCategoryId === "all" || dish.category === activeCategoryId);
  }, [activeCategoryId, menu?.dishes]);

  const categoryById = useMemo(() => new Map((menu?.categories ?? []).map((category) => [category.id, category])), [menu?.categories]);

  const openCreateCategory = () => {
    setCategoryEditor(emptyCategoryEditor());
    setCategoryModalOpen(true);
  };

  const openEditCategory = (category: MenuCategory) => {
    setCategoryEditor({
      id: category.id,
      labelRu: category.labelRu,
      icon: category.icon || "",
    });
    setCategoryModalOpen(true);
  };

  const openCreateDish = () => {
    setDishEditor(emptyDishEditor(menu?.categories[0]?.id ?? ""));
    setDishModalOpen(true);
  };

  const openEditDish = (dish: Dish) => {
    setDishEditor({
      id: dish.id,
      categoryId: dish.category,
      nameRu: dish.nameRu,
      nameIt: dish.nameIt,
      description: dish.description,
      price: String(dish.price),
      image: dish.image,
      portion: dish.portion,
      energyKcal: String(dish.energyKcal),
      badgeLabel: dish.badgeLabel || "",
      badgeTone: dish.badgeTone || "",
      highlight: !!dish.highlight,
      available: dish.available !== false,
    });
    setDishModalOpen(true);
  };

  const saveCategory = async () => {
    setSaving(true);
    try {
      const payload = {
        labelRu: categoryEditor.labelRu,
        icon: categoryEditor.icon || undefined,
      };
      const next = categoryEditor.id
        ? await updateManagerCategory(categoryEditor.id, payload)
        : await createManagerCategory(payload);
      setMenu(next);
      setCategoryModalOpen(false);
      setErrorText("");
    } catch {
      setErrorText("Не удалось сохранить.");
    } finally {
      setSaving(false);
    }
  };

  const removeCategory = async (categoryId: string) => {
    try {
      const next = await deleteManagerCategory(categoryId);
      setMenu(next);
      setErrorText("");
    } catch {
      setErrorText("Не удалось удалить.");
    }
  };

  const saveDish = async () => {
    setSaving(true);
    try {
      const payload = {
        categoryId: dishEditor.categoryId,
        nameRu: dishEditor.nameRu,
        nameIt: dishEditor.nameIt,
        description: dishEditor.description,
        price: Number(dishEditor.price || 0),
        image: dishEditor.image,
        portion: dishEditor.portion,
        energyKcal: Number(dishEditor.energyKcal || 0),
        badgeLabel: dishEditor.badgeLabel || undefined,
        badgeTone: dishEditor.badgeTone || undefined,
        highlight: dishEditor.highlight,
        available: dishEditor.available,
      };
      const next = dishEditor.id
        ? await updateManagerDish(dishEditor.id, payload)
        : await createManagerDish(payload);
      setMenu(next);
      setDishModalOpen(false);
      setErrorText("");
    } catch {
      setErrorText("Не удалось сохранить.");
    } finally {
      setSaving(false);
    }
  };

  const moveCategory = async (categoryId: string, direction: -1 | 1) => {
    if (!menu) return;
    const ids = [...menu.categories.map((category) => category.id)];
    const index = ids.indexOf(categoryId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= ids.length) return;
    const swap = ids[nextIndex];
    ids[nextIndex] = ids[index];
    ids[index] = swap;
    try {
      const next = await reorderManagerMenu({
        categoryIds: ids,
      });
      setMenu(next);
      setErrorText("");
    } catch {
      setErrorText("Не удалось изменить порядок.");
    }
  };

  const moveDish = async (dish: Dish, direction: -1 | 1) => {
    if (!menu) return;
    const dishIds = menu.dishes.filter((item) => item.category === dish.category).map((item) => item.id);
    const index = dishIds.indexOf(dish.id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= dishIds.length) return;
    const swap = dishIds[nextIndex];
    dishIds[nextIndex] = dishIds[index];
    dishIds[index] = swap;
    try {
      const next = await reorderManagerMenu({
        dishIdsByCategory: {
          [dish.category]: dishIds,
        },
      });
      setMenu(next);
      setErrorText("");
    } catch {
      setErrorText("Не удалось изменить порядок.");
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Меню</Text>
            <Text style={styles.subtitle}>Категории и блюда</Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable style={styles.secondaryButton} onPress={openCreateCategory}>
              <Text style={styles.secondaryButtonText}>Категория</Text>
            </Pressable>
            <Pressable style={styles.primaryButton} onPress={openCreateDish}>
              <Text style={styles.primaryButtonText}>Блюдо</Text>
            </Pressable>
          </View>
        </View>

        {loading ? <Text style={styles.meta}>Загрузка...</Text> : null}
        {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Категории</Text>
          <View style={styles.categoryChips}>
            <Pressable
              style={[styles.categoryChip, activeCategoryId === "all" && styles.categoryChipActive]}
              onPress={() => setActiveCategoryId("all")}
            >
              <Text style={[styles.categoryChipText, activeCategoryId === "all" && styles.categoryChipTextActive]}>Все</Text>
            </Pressable>
            {menu?.categories.map((category) => (
              <Pressable
                key={category.id}
                style={[styles.categoryChip, activeCategoryId === category.id && styles.categoryChipActive]}
                onPress={() => setActiveCategoryId(category.id)}
              >
                <Text
                  style={[
                    styles.categoryChipText,
                    activeCategoryId === category.id && styles.categoryChipTextActive,
                  ]}
                >
                  {category.labelRu}
                </Text>
              </Pressable>
            ))}
          </View>

          {menu?.categories.map((category) => (
            <View key={category.id} style={styles.card}>
              <Text style={styles.cardTitle}>{category.labelRu}</Text>
              <Text style={styles.cardMeta}>Блюд: {menu.dishes.filter((dish) => dish.category === category.id).length}</Text>
              <View style={styles.actionRow}>
                <Pressable style={styles.secondaryButton} onPress={() => openEditCategory(category)}>
                  <Text style={styles.secondaryButtonText}>Изменить</Text>
                </Pressable>
                <Pressable style={styles.secondaryButton} onPress={() => void moveCategory(category.id, -1)}>
                  <Text style={styles.secondaryButtonText}>Выше</Text>
                </Pressable>
                <Pressable style={styles.secondaryButton} onPress={() => void moveCategory(category.id, 1)}>
                  <Text style={styles.secondaryButtonText}>Ниже</Text>
                </Pressable>
                <Pressable style={styles.dangerButton} onPress={() => void removeCategory(category.id)}>
                  <Text style={styles.dangerButtonText}>Удалить</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Блюда</Text>
          {visibleDishes.map((dish) => (
            <View key={dish.id} style={styles.card}>
              <Text style={styles.cardTitle}>{dish.nameRu}</Text>
              <Text style={styles.cardMeta}>
                {categoryById.get(dish.category)?.labelRu || dish.category} · {formatPrice(dish.price)}
              </Text>
              <Text style={styles.cardMeta}>{dish.nameIt}</Text>
              <Text style={styles.cardMeta}>{dish.available === false ? "Стоп-лист" : "Доступно"}</Text>
              <View style={styles.actionRow}>
                <Pressable style={styles.secondaryButton} onPress={() => openEditDish(dish)}>
                  <Text style={styles.secondaryButtonText}>Изменить</Text>
                </Pressable>
                <Pressable
                  style={styles.secondaryButton}
                  onPress={() =>
                    void toggleManagerDishAvailability(dish.id)
                      .then(setMenu)
                      .catch(() => setErrorText("Не удалось изменить доступность."))
                  }
                >
                  <Text style={styles.secondaryButtonText}>{dish.available === false ? "Вернуть" : "Стоп-лист"}</Text>
                </Pressable>
                <Pressable style={styles.secondaryButton} onPress={() => void moveDish(dish, -1)}>
                  <Text style={styles.secondaryButtonText}>Выше</Text>
                </Pressable>
                <Pressable style={styles.secondaryButton} onPress={() => void moveDish(dish, 1)}>
                  <Text style={styles.secondaryButtonText}>Ниже</Text>
                </Pressable>
                <Pressable
                  style={styles.dangerButton}
                  onPress={() =>
                    void deleteManagerDish(dish.id)
                      .then(setMenu)
                      .catch(() => setErrorText("Не удалось удалить блюдо."))
                  }
                >
                  <Text style={styles.dangerButtonText}>Удалить</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      <Modal visible={categoryModalOpen} animationType="slide" onRequestClose={() => setCategoryModalOpen(false)}>
        <SafeAreaView style={styles.modalArea}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{categoryEditor.id ? "Категория" : "Новая категория"}</Text>
            <TextInput
              value={categoryEditor.labelRu}
              onChangeText={(labelRu) => setCategoryEditor((current) => ({ ...current, labelRu }))}
              placeholder="Название"
              style={styles.input}
            />
            <TextInput
              value={categoryEditor.icon}
              onChangeText={(icon) => setCategoryEditor((current) => ({ ...current, icon }))}
              placeholder="Иконка"
              style={styles.input}
            />
            <View style={styles.modalActions}>
              <Pressable style={styles.secondaryButton} onPress={() => setCategoryModalOpen(false)}>
                <Text style={styles.secondaryButtonText}>Отмена</Text>
              </Pressable>
              <Pressable style={styles.primaryButton} onPress={() => void saveCategory()} disabled={saving}>
                <Text style={styles.primaryButtonText}>{saving ? "..." : "Сохранить"}</Text>
              </Pressable>
            </View>
          </View>
        </SafeAreaView>
      </Modal>

      <Modal visible={dishModalOpen} animationType="slide" onRequestClose={() => setDishModalOpen(false)}>
        <SafeAreaView style={styles.modalArea}>
          <ScrollView contentContainerStyle={styles.modalContent}>
            <Text style={styles.modalTitle}>{dishEditor.id ? "Блюдо" : "Новое блюдо"}</Text>
            <TextInput value={dishEditor.categoryId} onChangeText={(categoryId) => setDishEditor((current) => ({ ...current, categoryId }))} placeholder="Категория" style={styles.input} />
            <TextInput value={dishEditor.nameRu} onChangeText={(nameRu) => setDishEditor((current) => ({ ...current, nameRu }))} placeholder="Название" style={styles.input} />
            <TextInput value={dishEditor.nameIt} onChangeText={(nameIt) => setDishEditor((current) => ({ ...current, nameIt }))} placeholder="Название IT" style={styles.input} />
            <TextInput value={dishEditor.description} onChangeText={(description) => setDishEditor((current) => ({ ...current, description }))} placeholder="Описание" multiline style={[styles.input, styles.multiline]} />
            <TextInput value={dishEditor.price} onChangeText={(price) => setDishEditor((current) => ({ ...current, price }))} placeholder="Цена" keyboardType="numeric" style={styles.input} />
            <TextInput value={dishEditor.image} onChangeText={(image) => setDishEditor((current) => ({ ...current, image }))} placeholder="Изображение" style={styles.input} />
            <TextInput value={dishEditor.portion} onChangeText={(portion) => setDishEditor((current) => ({ ...current, portion }))} placeholder="Порция" style={styles.input} />
            <TextInput value={dishEditor.energyKcal} onChangeText={(energyKcal) => setDishEditor((current) => ({ ...current, energyKcal }))} placeholder="Ккал" keyboardType="numeric" style={styles.input} />
            <TextInput value={dishEditor.badgeLabel} onChangeText={(badgeLabel) => setDishEditor((current) => ({ ...current, badgeLabel }))} placeholder="Бейдж" style={styles.input} />
            <TextInput value={dishEditor.badgeTone} onChangeText={(badgeTone) => setDishEditor((current) => ({ ...current, badgeTone }))} placeholder="Цвет бейджа" style={styles.input} />
            <View style={styles.toggleRow}>
              <Pressable style={[styles.toggleChip, dishEditor.available && styles.toggleChipActive]} onPress={() => setDishEditor((current) => ({ ...current, available: !current.available }))}>
                <Text style={[styles.toggleChipText, dishEditor.available && styles.toggleChipTextActive]}>
                  {dishEditor.available ? "Доступно" : "Стоп-лист"}
                </Text>
              </Pressable>
              <Pressable style={[styles.toggleChip, dishEditor.highlight && styles.toggleChipActive]} onPress={() => setDishEditor((current) => ({ ...current, highlight: !current.highlight }))}>
                <Text style={[styles.toggleChipText, dishEditor.highlight && styles.toggleChipTextActive]}>
                  {dishEditor.highlight ? "Акцент" : "Обычное"}
                </Text>
              </Pressable>
            </View>
            <View style={styles.modalActions}>
              <Pressable style={styles.secondaryButton} onPress={() => setDishModalOpen(false)}>
                <Text style={styles.secondaryButtonText}>Отмена</Text>
              </Pressable>
              <Pressable style={styles.primaryButton} onPress={() => void saveDish()} disabled={saving}>
                <Text style={styles.primaryButtonText}>{saving ? "..." : "Сохранить"}</Text>
              </Pressable>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  content: {
    padding: 16,
    gap: 16,
  },
  header: {
    gap: 12,
  },
  headerActions: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  title: {
    fontSize: 30,
    fontWeight: "700",
    color: colors.navyDeep,
  },
  subtitle: {
    marginTop: 4,
    color: colors.muted,
    fontSize: 13,
  },
  meta: {
    color: colors.muted,
  },
  errorText: {
    color: "#B42318",
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    color: colors.navyDeep,
    fontWeight: "700",
    fontSize: 18,
  },
  categoryChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  categoryChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  categoryChipActive: {
    borderColor: colors.navy,
    backgroundColor: colors.navy,
  },
  categoryChipText: {
    color: colors.navy,
    fontWeight: "600",
  },
  categoryChipTextActive: {
    color: colors.white,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    padding: 12,
    gap: 6,
  },
  cardTitle: {
    color: colors.navyDeep,
    fontWeight: "700",
    fontSize: 17,
  },
  cardMeta: {
    color: colors.muted,
    fontSize: 13,
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 6,
  },
  primaryButton: {
    minHeight: 42,
    borderRadius: 10,
    backgroundColor: colors.navy,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  primaryButtonText: {
    color: colors.white,
    fontWeight: "700",
  },
  secondaryButton: {
    minHeight: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  secondaryButtonText: {
    color: colors.navy,
    fontWeight: "600",
  },
  dangerButton: {
    minHeight: 42,
    borderRadius: 10,
    backgroundColor: "#FDECEA",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  dangerButtonText: {
    color: "#B42318",
    fontWeight: "700",
  },
  modalArea: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  modalContent: {
    padding: 16,
    gap: 12,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.navyDeep,
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
  },
  multiline: {
    minHeight: 100,
    textAlignVertical: "top",
  },
  toggleRow: {
    flexDirection: "row",
    gap: 8,
  },
  toggleChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  toggleChipActive: {
    borderColor: colors.navy,
    backgroundColor: colors.navy,
  },
  toggleChipText: {
    color: colors.navy,
    fontWeight: "600",
  },
  toggleChipTextActive: {
    color: colors.white,
  },
  modalActions: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "flex-end",
  },
});
