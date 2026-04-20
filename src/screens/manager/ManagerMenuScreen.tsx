import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  createManagerCategory,
  createManagerDish,
  deleteManagerCategory,
  deleteManagerDish,
  fetchManagerMenu,
  toggleManagerDishAvailability,
  updateManagerCategory,
  updateManagerDish,
  uploadManagerMenuImage,
} from "../../api/client";
import { useRealtimeRefresh } from "../../realtime/useRealtimeRefresh";
import { colors } from "../../theme/colors";
import { formatPrice } from "../../theme/format";
import type { Dish, ManagerMenuSnapshot, MenuCategory, MenuImageDraftState, RealtimeEvent } from "../../types/domain";
import { getOptimizedMenuImageUrl } from "../../utils/menuImage";
import {
  BADGE_TONE_OPTIONS,
  countDishesByCategory,
  getCategoryCoverImage,
  normalizeCaloriesInput,
  normalizePortionInput,
  normalizePriceInput,
} from "./menuEditor";

type CategoryEditor = {
  id?: string;
  labelRu: string;
};

type DishEditor = {
  id?: string;
  categoryId: string;
  nameRu: string;
  nameIt: string;
  description: string;
  price: string;
  image: string;
  imageState: MenuImageDraftState;
  portion: string;
  energyKcal: string;
  badgeLabel: string;
  badgeTone?: "gold" | "navy" | "sage" | "blush";
  highlight: boolean;
  available: boolean;
};

const TABLET_BREAKPOINT = 980;

function emptyCategoryEditor(): CategoryEditor {
  return { labelRu: "" };
}

function emptyDishEditor(categoryId: string): DishEditor {
  return {
    categoryId,
    nameRu: "",
    nameIt: "",
    description: "",
    price: "",
    image: "",
    imageState: { mode: "empty" },
    portion: "",
    energyKcal: "",
    badgeLabel: "",
    badgeTone: undefined,
    highlight: false,
    available: true,
  };
}

function toDishEditor(dish: Dish): DishEditor {
  return {
    id: dish.id,
    categoryId: dish.category,
    nameRu: dish.nameRu,
    nameIt: dish.nameIt,
    description: dish.description,
    price: String(dish.price),
    image: dish.image,
    imageState: dish.image ? { mode: "uploaded", uri: dish.image, url: dish.image } : { mode: "empty" },
    portion: dish.portion,
    energyKcal: String(dish.energyKcal),
    badgeLabel: dish.badgeLabel || "",
    badgeTone: dish.badgeTone as DishEditor["badgeTone"],
    highlight: !!dish.highlight,
    available: dish.available !== false,
  };
}

function Banner({ tone, text }: { tone: "warning" | "error"; text: string }) {
  return (
    <View style={[styles.banner, tone === "error" ? styles.errorBanner : styles.warningBanner]}>
      <Text style={[styles.bannerText, tone === "error" ? styles.errorBannerText : styles.warningBannerText]}>
        {text}
      </Text>
    </View>
  );
}

function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (next: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: "default" | "numeric";
}) {
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#8A847A"
        style={[styles.input, multiline ? styles.inputMultiline : null]}
        multiline={multiline}
        keyboardType={keyboardType}
      />
    </View>
  );
}

function SheetTitle({ children }: { children: string }) {
  return <Text style={styles.sheetSectionTitle}>{children}</Text>;
}

function ActionIcon({
  name,
  tone = "default",
  onPress,
  disabled,
}: {
  name: keyof typeof Ionicons.glyphMap;
  tone?: "default" | "accent" | "danger";
  onPress: () => void;
  disabled?: boolean;
}) {
  const iconColor = tone === "danger" ? "#B42318" : tone === "accent" ? colors.navy : "#5E5A53";

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.actionIcon,
        tone === "accent" ? styles.actionIconAccent : null,
        tone === "danger" ? styles.actionIconDanger : null,
        disabled ? styles.buttonDisabled : null,
      ]}
    >
      <Ionicons name={name} size={18} color={iconColor} />
    </Pressable>
  );
}

function CategoryChipScroller({
  categories,
  selectedCategoryId,
  onSelect,
}: {
  categories: MenuCategory[];
  selectedCategoryId: string;
  onSelect: (categoryId: string) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.horizontalChipsContent}
    >
      {categories.map((category) => (
        <Pressable
          key={category.id}
          style={[styles.choiceChip, selectedCategoryId === category.id ? styles.choiceChipActive : null]}
          onPress={() => onSelect(category.id)}
        >
          <Text style={[styles.choiceChipText, selectedCategoryId === category.id ? styles.choiceChipTextActive : null]}>
            {category.labelRu}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

export function ManagerMenuScreen() {
  const { width } = useWindowDimensions();
  const isTablet = width >= TABLET_BREAKPOINT;

  const [menu, setMenu] = useState<ManagerMenuSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [categoryEditor, setCategoryEditor] = useState<CategoryEditor>(emptyCategoryEditor());
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [savingCategory, setSavingCategory] = useState(false);
  const [dishEditor, setDishEditor] = useState<DishEditor>(emptyDishEditor(""));
  const [dishEditorOpen, setDishEditorOpen] = useState(false);
  const [savingDish, setSavingDish] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  const pull = useCallback(async () => {
    const next = await fetchManagerMenu();
    setMenu(next);
    setSelectedCategoryId((current) => {
      if (current && next.categories.some((category) => category.id === current)) return current;
      return null;
    });
  }, []);

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

  const { connected, connecting } = useRealtimeRefresh({
    filter: useCallback((event: RealtimeEvent) => event.type === "menu:changed", []),
    refresh: pull,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await pull();
      setErrorText("");
    } catch {
      setErrorText("Не удалось обновить меню.");
    } finally {
      setRefreshing(false);
    }
  }, [pull]);

  const dishCounts = useMemo(() => countDishesByCategory(menu?.dishes ?? []), [menu?.dishes]);
  const selectedCategory = useMemo(
    () => menu?.categories.find((category) => category.id === selectedCategoryId) ?? null,
    [menu?.categories, selectedCategoryId],
  );
  const categoryDishes = useMemo(
    () => (menu?.dishes ?? []).filter((dish) => dish.category === selectedCategoryId),
    [menu?.dishes, selectedCategoryId],
  );

  const openCreateCategory = useCallback(() => {
    setCategoryEditor(emptyCategoryEditor());
    setCategoryModalOpen(true);
  }, []);

  const openEditCategory = useCallback((category: MenuCategory) => {
    setCategoryEditor({ id: category.id, labelRu: category.labelRu });
    setCategoryModalOpen(true);
  }, []);

  const openCreateDish = useCallback(() => {
    if (!selectedCategoryId) return;
    setDishEditor(emptyDishEditor(selectedCategoryId));
    setDishEditorOpen(true);
  }, [selectedCategoryId]);

  const openEditDish = useCallback((dish: Dish) => {
    setDishEditor(toDishEditor(dish));
    setDishEditorOpen(true);
  }, []);

  const closeDishEditor = useCallback(() => {
    if (savingDish || uploadingImage) return;
    setDishEditorOpen(false);
  }, [savingDish, uploadingImage]);

  const saveCategory = useCallback(async () => {
    const labelRu = categoryEditor.labelRu.trim();
    if (!labelRu) {
      setErrorText("Укажи название категории.");
      return;
    }

    setSavingCategory(true);
    try {
      const next = categoryEditor.id
        ? await updateManagerCategory(categoryEditor.id, { labelRu })
        : await createManagerCategory({ labelRu });

      setMenu(next);
      setCategoryModalOpen(false);
      setErrorText("");

      const persisted =
        next.categories.find((category) => category.id === categoryEditor.id) ??
        next.categories[next.categories.length - 1];
      if (persisted) setSelectedCategoryId(persisted.id);
    } catch {
      setErrorText("Не удалось сохранить категорию.");
    } finally {
      setSavingCategory(false);
    }
  }, [categoryEditor]);

  const confirmDeleteCategory = useCallback(
    (category: MenuCategory) => {
      const dishesCount = dishCounts[category.id] || 0;
      if (dishesCount > 0) {
        setErrorText("Сначала удали блюда из этой категории.");
        return;
      }

      Alert.alert("Удалить категорию?", category.labelRu, [
        { text: "Отмена", style: "cancel" },
        {
          text: "Удалить",
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                const next = await deleteManagerCategory(category.id);
                setMenu(next);
                setErrorText("");
                setSelectedCategoryId(null);
              } catch {
                setErrorText("Не удалось удалить категорию.");
              }
            })();
          },
        },
      ]);
    },
    [dishCounts],
  );

  const saveDish = useCallback(async () => {
    const payload = {
      categoryId: dishEditor.categoryId,
      nameRu: dishEditor.nameRu.trim(),
      nameIt: dishEditor.nameIt.trim(),
      description: dishEditor.description.trim(),
      price: Number(dishEditor.price || 0),
      image: dishEditor.image,
      portion: dishEditor.portion.trim(),
      energyKcal: Number(dishEditor.energyKcal || 0),
      badgeLabel: dishEditor.badgeLabel.trim() || undefined,
      badgeTone: dishEditor.badgeTone,
      highlight: dishEditor.highlight,
      available: dishEditor.available,
    };

    if (!payload.categoryId || !payload.nameRu || !payload.nameIt || !payload.image || !payload.portion) {
      setErrorText("Заполни название, фото, категорию и порцию.");
      return;
    }

    setSavingDish(true);
    try {
      const next = dishEditor.id
        ? await updateManagerDish(dishEditor.id, payload)
        : await createManagerDish(payload);
      setMenu(next);
      setSelectedCategoryId(payload.categoryId);
      setDishEditorOpen(false);
      setErrorText("");
    } catch {
      setErrorText("Не удалось сохранить блюдо.");
    } finally {
      setSavingDish(false);
    }
  }, [dishEditor]);

  const confirmDeleteDish = useCallback((dish: Dish) => {
    Alert.alert("Удалить блюдо?", dish.nameRu, [
      { text: "Отмена", style: "cancel" },
      {
        text: "Удалить",
        style: "destructive",
        onPress: () => {
          void (async () => {
            try {
              const next = await deleteManagerDish(dish.id);
              setMenu(next);
              setDishEditorOpen(false);
              setErrorText("");
            } catch {
              setErrorText("Не удалось удалить блюдо.");
            }
          })();
        },
      },
    ]);
  }, []);

  const confirmDeleteEditedDish = useCallback(() => {
    if (!dishEditor.id) return;
    confirmDeleteDish({
      id: dishEditor.id,
      category: dishEditor.categoryId,
      nameRu: dishEditor.nameRu,
      nameIt: dishEditor.nameIt,
      description: dishEditor.description,
      price: Number(dishEditor.price || 0),
      image: dishEditor.image,
      portion: dishEditor.portion,
      energyKcal: Number(dishEditor.energyKcal || 0),
      badgeLabel: dishEditor.badgeLabel || undefined,
      badgeTone: dishEditor.badgeTone,
      highlight: dishEditor.highlight,
      available: dishEditor.available,
    });
  }, [confirmDeleteDish, dishEditor]);

  const toggleAvailability = useCallback(async (dish: Dish) => {
    try {
      const next = await toggleManagerDishAvailability(dish.id);
      setMenu(next);
      setErrorText("");
    } catch {
      setErrorText("Не удалось изменить статус блюда.");
    }
  }, []);

  const pickDishImage = useCallback(async (source: "camera" | "library") => {
    try {
      if (source === "camera") {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          setErrorText("Нужен доступ к камере.");
          return;
        }
      } else {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          setErrorText("Нужен доступ к фото.");
          return;
        }
      }

      const result =
        source === "camera"
          ? await ImagePicker.launchCameraAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              quality: 0.9,
              allowsEditing: true,
            })
          : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              quality: 0.9,
              allowsEditing: true,
            });

      if (result.canceled || !result.assets[0]) return;

      const asset = result.assets[0];
      setUploadingImage(true);
      setDishEditor((current) => ({
        ...current,
        imageState: { mode: "uploading", uri: asset.uri },
      }));

      const uploaded = await uploadManagerMenuImage(asset);
      setDishEditor((current) => ({
        ...current,
        image: uploaded.url,
        imageState: {
          mode: "uploaded",
          uri: asset.uri,
          url: uploaded.url,
          width: uploaded.width,
          height: uploaded.height,
        },
      }));
      setErrorText("");
    } catch {
      setDishEditor((current) => ({
        ...current,
        imageState:
          current.imageState.mode === "uploading"
            ? { mode: "error", uri: current.imageState.uri, errorText: "Не удалось загрузить фото." }
            : { mode: "empty" },
      }));
      setErrorText("Не удалось загрузить фото.");
    } finally {
      setUploadingImage(false);
    }
  }, []);

  const removeDishImage = useCallback(() => {
    setDishEditor((current) => ({
      ...current,
      image: "",
      imageState: { mode: "empty" },
    }));
  }, []);

  const categoriesScreen = (
    <ScrollView
      contentContainerStyle={styles.listContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.pageHeader}>
        <View>
          <Text style={styles.title}>Меню</Text>
          <Text style={styles.subtitle}>Категории</Text>
        </View>
        <Pressable style={styles.primaryButton} onPress={openCreateCategory}>
          <Ionicons name="add" size={18} color={colors.white} />
          <Text style={styles.primaryButtonText}>Категория</Text>
        </Pressable>
      </View>

      {!loading && !connected && !connecting ? (
        <Banner tone="warning" text="Нет live-обновлений. Меню можно обновить вручную." />
      ) : null}
      {errorText ? <Banner tone="error" text={errorText} /> : null}

      {!loading && (menu?.categories.length ?? 0) === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <Ionicons name="albums-outline" size={26} color={colors.navy} />
          </View>
          <Text style={styles.emptyTitle}>Категорий пока нет</Text>
          <Pressable style={styles.primaryButton} onPress={openCreateCategory}>
            <Ionicons name="add" size={18} color={colors.white} />
            <Text style={styles.primaryButtonText}>Добавить категорию</Text>
          </Pressable>
        </View>
      ) : null}

      {!loading && (menu?.categories.length ?? 0) > 0 ? (
        <Pressable
          style={[styles.categoryCard, selectedCategoryId === null && isTablet ? styles.categoryCardActive : null]}
          onPress={() => setSelectedCategoryId(null)}
        >
          <View style={styles.categoryCover}>
            <Ionicons name="grid-outline" size={28} color={colors.navy} />
          </View>
          <View style={styles.categoryCopy}>
            <Text style={styles.categoryTitle}>Все меню</Text>
            <Text style={styles.categoryHint}>{menu?.dishes.length ?? 0} блюд во всех категориях</Text>
          </View>
          <View style={styles.categoryActions}>
            <Ionicons name="chevron-forward-outline" size={18} color={colors.navyDeep} />
          </View>
        </Pressable>
      ) : null}

      {(menu?.categories ?? []).map((category) => {
        const dishesCount = dishCounts[category.id] || 0;
        const cover = getCategoryCoverImage(menu, category.id);

        return (
          <Pressable
            key={category.id}
            style={[
              styles.categoryCard,
              selectedCategoryId === category.id && isTablet ? styles.categoryCardActive : null,
            ]}
            onPress={() => setSelectedCategoryId(category.id)}
          >
            <View style={styles.categoryCover}>
              {cover ? (
                <Image
                  source={{ uri: getOptimizedMenuImageUrl(cover, 512) }}
                  style={styles.categoryCoverImage}
                  resizeMode="cover"
                />
              ) : (
                <Ionicons name="restaurant-outline" size={28} color={colors.navy} />
              )}
            </View>

            <View style={styles.categoryCopy}>
              <Text style={styles.categoryTitle} numberOfLines={2}>
                {category.labelRu}
              </Text>
              <Text style={styles.categoryHint}>{dishesCount === 0 ? "Пока пусто" : `${dishesCount} блюд`}</Text>
            </View>

            <View style={styles.categoryActions}>
              <ActionIcon name="create-outline" onPress={() => openEditCategory(category)} />
              <ActionIcon
                name="trash-outline"
                tone="danger"
                disabled={dishesCount > 0}
                onPress={() => confirmDeleteCategory(category)}
              />
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );

  const categoryDetail = selectedCategory ? (
    <View style={styles.detailShell}>
      <View style={styles.detailHeader}>
        <View style={styles.detailHeaderMain}>
          {!isTablet ? (
            <Pressable style={styles.secondaryButton} onPress={() => setSelectedCategoryId(null)}>
              <Ionicons name="chevron-back" size={18} color={colors.navy} />
            </Pressable>
          ) : null}
          <View style={styles.detailHeaderCopy}>
            <Text style={styles.detailTitle}>{selectedCategory.labelRu}</Text>
            <Text style={styles.subtitle}>{dishCounts[selectedCategory.id] || 0} блюд</Text>
          </View>
        </View>

        <View style={styles.detailHeaderActions}>
          <Pressable style={styles.secondaryButton} onPress={() => openEditCategory(selectedCategory)}>
            <Ionicons name="create-outline" size={18} color={colors.navy} />
          </Pressable>
          <Pressable style={styles.primaryButton} onPress={openCreateDish}>
            <Ionicons name="add" size={18} color={colors.white} />
            <Text style={styles.primaryButtonText}>Блюдо</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        style={styles.detailScroll}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {!loading && !connected && !connecting ? (
          <Banner tone="warning" text="Нет live-обновлений. Меню можно обновить вручную." />
        ) : null}
        {errorText ? <Banner tone="error" text={errorText} /> : null}

        {categoryDishes.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Ionicons name="images-outline" size={26} color={colors.navy} />
            </View>
            <Text style={styles.emptyTitle}>В этой категории пока нет блюд</Text>
            <Pressable style={styles.primaryButton} onPress={openCreateDish}>
              <Ionicons name="add" size={18} color={colors.white} />
              <Text style={styles.primaryButtonText}>Добавить блюдо</Text>
            </Pressable>
          </View>
        ) : null}

        {categoryDishes.map((dish) => (
          <View key={dish.id} style={styles.dishCard}>
            <View style={styles.dishTopRow}>
              <Image
                source={{ uri: getOptimizedMenuImageUrl(dish.image, 512) }}
                style={styles.dishImage}
                resizeMode="cover"
              />

              <View style={styles.dishTopContent}>
                <View style={styles.dishTitleRow}>
                  <Text style={styles.dishName} numberOfLines={2}>
                    {dish.nameRu}
                  </Text>
                </View>
                <Text style={styles.dishPrice}>{formatPrice(dish.price)}</Text>
              </View>
            </View>

            <View style={styles.dishMiddleRow}>
              {dish.description ? (
                <Text style={styles.dishDescription} numberOfLines={2}>
                  {dish.description}
                </Text>
              ) : (
                <Text style={styles.dishDescriptionMuted}>Без описания</Text>
              )}

              <View style={styles.statusRow}>
                <Text style={styles.dishMeta}>{dish.portion}</Text>
                <Text style={styles.dot}>•</Text>
                <Text style={styles.dishMeta}>{dish.energyKcal} ккал</Text>
                <View style={[styles.statusPill, dish.available === false ? styles.statusPillOff : styles.statusPillOn]}>
                  <Text
                    style={[
                      styles.statusPillText,
                      dish.available === false ? styles.statusPillTextOff : styles.statusPillTextOn,
                    ]}
                  >
                    {dish.available === false ? "Стоп" : "В меню"}
                  </Text>
                </View>
                {dish.highlight ? (
                  <View style={styles.softPill}>
                    <Text style={styles.softPillText}>Акцент</Text>
                  </View>
                ) : null}
                {dish.badgeLabel ? (
                  <View style={styles.softPill}>
                    <Text style={styles.softPillText}>{dish.badgeLabel}</Text>
                  </View>
                ) : null}
              </View>
            </View>

            <View style={styles.dishActionsRow}>
              <ActionIcon name="create-outline" onPress={() => openEditDish(dish)} />
              <ActionIcon
                name={dish.available === false ? "checkmark-circle-outline" : "pause-circle-outline"}
                tone="accent"
                onPress={() => void toggleAvailability(dish)}
              />
              <ActionIcon name="trash-outline" tone="danger" onPress={() => confirmDeleteDish(dish)} />
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  ) : (
    <ScrollView
      style={styles.detailScroll}
      contentContainerStyle={styles.listContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.detailHeader}>
        <View style={styles.detailHeaderMain}>
          <View style={styles.detailHeaderCopy}>
            <Text style={styles.detailTitle}>Все меню</Text>
            <Text style={styles.subtitle}>
              {(menu?.categories.length ?? 0)} категорий · {(menu?.dishes.length ?? 0)} блюд
            </Text>
          </View>
        </View>
      </View>

      {!loading && !connected && !connecting ? (
        <Banner tone="warning" text="Нет live-обновлений. Меню можно обновить вручную." />
      ) : null}
      {errorText ? <Banner tone="error" text={errorText} /> : null}

      {(menu?.categories.length ?? 0) === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <Ionicons name="albums-outline" size={26} color={colors.navy} />
          </View>
          <Text style={styles.emptyTitle}>Категорий пока нет</Text>
          <Pressable style={styles.primaryButton} onPress={openCreateCategory}>
            <Ionicons name="add" size={18} color={colors.white} />
            <Text style={styles.primaryButtonText}>Добавить категорию</Text>
          </Pressable>
        </View>
      ) : null}

      {(menu?.categories ?? []).map((category) => (
        <View key={category.id} style={styles.overviewSection}>
          <View style={styles.overviewSectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>{category.labelRu}</Text>
              <Text style={styles.categoryHint}>{dishCounts[category.id] || 0} блюд</Text>
            </View>
            <Pressable style={styles.secondaryButton} onPress={() => setSelectedCategoryId(category.id)}>
              <Ionicons name="open-outline" size={18} color={colors.navy} />
            </Pressable>
          </View>
          {(menu?.dishes ?? [])
            .filter((dish) => dish.category === category.id)
            .slice(0, 4)
            .map((dish) => (
              <Pressable key={dish.id} style={styles.overviewDishRow} onPress={() => openEditDish(dish)}>
                <Image source={{ uri: getOptimizedMenuImageUrl(dish.image, 256) }} style={styles.overviewDishImage} />
                <View style={styles.overviewDishCopy}>
                  <Text style={styles.overviewDishTitle} numberOfLines={1}>{dish.nameRu}</Text>
                  <Text style={styles.categoryHint}>{formatPrice(dish.price)}</Text>
                </View>
                <Ionicons name="create-outline" size={18} color={colors.navyDeep} />
              </Pressable>
            ))}
        </View>
      ))}
    </ScrollView>
  );

  const categoryModal = (
    <Modal visible={categoryModalOpen} animationType="slide" transparent onRequestClose={() => setCategoryModalOpen(false)}>
      <View style={styles.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.sheetWrap}>
          <View style={styles.modalSheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{categoryEditor.id ? "Категория" : "Новая категория"}</Text>
              <Pressable style={styles.secondaryButton} onPress={() => setCategoryModalOpen(false)}>
                <Ionicons name="close" size={18} color={colors.navy} />
              </Pressable>
            </View>

            <TextField
              label="Название"
              value={categoryEditor.labelRu}
              onChangeText={(labelRu) => setCategoryEditor((current) => ({ ...current, labelRu }))}
              placeholder="Например, Паста"
            />

            <View style={styles.modalActions}>
              <Pressable style={styles.secondaryWideButton} onPress={() => setCategoryModalOpen(false)}>
                <Text style={styles.secondaryWideButtonText}>Отмена</Text>
              </Pressable>
              <Pressable
                style={[styles.primaryWideButton, savingCategory ? styles.buttonDisabled : null]}
                onPress={() => void saveCategory()}
                disabled={savingCategory}
              >
                <Text style={styles.primaryButtonText}>{savingCategory ? "..." : "Сохранить"}</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );

  const dishEditorContent = (
    <View style={styles.editorPanel}>
      <View style={styles.sheetHeader}>
        <Text style={styles.sheetTitle}>{dishEditor.id ? "Блюдо" : "Новое блюдо"}</Text>
        <Pressable style={styles.secondaryButton} onPress={closeDishEditor}>
          <Ionicons name="close" size={18} color={colors.navy} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.editorContent} keyboardShouldPersistTaps="handled">
        <SheetTitle>Фото</SheetTitle>
        <View style={styles.photoCard}>
          {dishEditor.imageState.mode === "empty" ? (
            <View style={styles.photoPlaceholder}>
              <Ionicons name="image-outline" size={28} color="#8C877F" />
            </View>
          ) : (
            <Image
              source={{
                uri:
                  dishEditor.imageState.mode === "uploaded"
                    ? dishEditor.imageState.url
                    : dishEditor.imageState.uri,
              }}
              style={styles.photoPreview}
              resizeMode="cover"
            />
          )}

          <View style={styles.photoActions}>
            <Pressable
              style={[styles.secondaryWideButton, uploadingImage ? styles.buttonDisabled : null]}
              onPress={() => void pickDishImage("camera")}
              disabled={uploadingImage}
            >
              <Ionicons name="camera-outline" size={18} color={colors.navy} />
              <Text style={styles.secondaryWideButtonText}>Камера</Text>
            </Pressable>
            <Pressable
              style={[styles.secondaryWideButton, uploadingImage ? styles.buttonDisabled : null]}
              onPress={() => void pickDishImage("library")}
              disabled={uploadingImage}
            >
              <Ionicons name="images-outline" size={18} color={colors.navy} />
              <Text style={styles.secondaryWideButtonText}>Галерея</Text>
            </Pressable>
            <Pressable
              style={[styles.secondaryWideButton, uploadingImage ? styles.buttonDisabled : null]}
              onPress={removeDishImage}
              disabled={uploadingImage}
            >
              <Ionicons name="trash-outline" size={18} color={colors.navy} />
              <Text style={styles.secondaryWideButtonText}>Убрать</Text>
            </Pressable>
          </View>

          {dishEditor.imageState.mode === "uploading" ? <Text style={styles.helperText}>Загружаем фото...</Text> : null}
          {dishEditor.imageState.mode === "error" ? <Text style={styles.errorText}>{dishEditor.imageState.errorText}</Text> : null}
        </View>

        <SheetTitle>Основное</SheetTitle>
        <TextField
          label="Название"
          value={dishEditor.nameRu}
          onChangeText={(nameRu) => setDishEditor((current) => ({ ...current, nameRu }))}
        />
        <TextField
          label="Название на итальянском"
          value={dishEditor.nameIt}
          onChangeText={(nameIt) => setDishEditor((current) => ({ ...current, nameIt }))}
        />
        <View style={styles.row}>
          <View style={styles.rowItem}>
            <TextField
              label="Цена"
              value={dishEditor.price}
              onChangeText={(price) => setDishEditor((current) => ({ ...current, price: normalizePriceInput(price) }))}
              keyboardType="numeric"
              placeholder="0"
            />
          </View>
          <View style={styles.rowItem}>
            <TextField
              label="Порция"
              value={dishEditor.portion}
              onChangeText={(portion) =>
                setDishEditor((current) => ({ ...current, portion: normalizePortionInput(portion) }))
              }
              placeholder="250 г"
            />
          </View>
        </View>

        <SheetTitle>Описание</SheetTitle>
        <TextField
          label="Описание"
          value={dishEditor.description}
          onChangeText={(description) => setDishEditor((current) => ({ ...current, description }))}
          multiline
        />

        <SheetTitle>Параметры</SheetTitle>
        <Text style={styles.fieldLabel}>Категория</Text>
        <CategoryChipScroller
          categories={menu?.categories ?? []}
          selectedCategoryId={dishEditor.categoryId}
          onSelect={(categoryId) => setDishEditor((current) => ({ ...current, categoryId }))}
        />

        <View style={styles.row}>
          <View style={styles.rowItem}>
            <TextField
              label="Ккал"
              value={dishEditor.energyKcal}
              onChangeText={(energyKcal) =>
                setDishEditor((current) => ({ ...current, energyKcal: normalizeCaloriesInput(energyKcal) }))
              }
              keyboardType="numeric"
              placeholder="0"
            />
          </View>
          <View style={styles.rowItem}>
            <TextField
              label="Бейдж"
              value={dishEditor.badgeLabel}
              onChangeText={(badgeLabel) => setDishEditor((current) => ({ ...current, badgeLabel }))}
              placeholder="Новинка"
            />
          </View>
        </View>

        <Text style={styles.fieldLabel}>Цвет бейджа</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalChipsContent}>
          {BADGE_TONE_OPTIONS.map((tone) => (
            <Pressable
              key={tone.value}
              style={[styles.choiceChip, dishEditor.badgeTone === tone.value ? styles.choiceChipActive : null]}
              onPress={() =>
                setDishEditor((current) => ({
                  ...current,
                  badgeTone: current.badgeTone === tone.value ? undefined : tone.value,
                }))
              }
            >
              <Text style={[styles.choiceChipText, dishEditor.badgeTone === tone.value ? styles.choiceChipTextActive : null]}>
                {tone.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <SheetTitle>Отметка</SheetTitle>
        <Text style={styles.fieldLabel}>Статус</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalChipsContent}>
          <Pressable
            style={[styles.choiceChip, dishEditor.available ? styles.choiceChipActive : null]}
            onPress={() => setDishEditor((current) => ({ ...current, available: true }))}
          >
            <Text style={[styles.choiceChipText, dishEditor.available ? styles.choiceChipTextActive : null]}>В меню</Text>
          </Pressable>
          <Pressable
            style={[styles.choiceChip, !dishEditor.available ? styles.choiceChipActive : null]}
            onPress={() => setDishEditor((current) => ({ ...current, available: false }))}
          >
            <Text style={[styles.choiceChipText, !dishEditor.available ? styles.choiceChipTextActive : null]}>Стоп</Text>
          </Pressable>
        </ScrollView>

        <Text style={styles.fieldLabel}>Акцент</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalChipsContent}>
          <Pressable
            style={[styles.choiceChip, dishEditor.highlight ? styles.choiceChipActive : null]}
            onPress={() => setDishEditor((current) => ({ ...current, highlight: !current.highlight }))}
          >
            <Text style={[styles.choiceChipText, dishEditor.highlight ? styles.choiceChipTextActive : null]}>
              {dishEditor.highlight ? "Включён" : "Обычный"}
            </Text>
          </Pressable>
        </ScrollView>

        <View style={styles.modalActions}>
          <Pressable style={styles.secondaryWideButton} onPress={closeDishEditor}>
            <Text style={styles.secondaryWideButtonText}>Отмена</Text>
          </Pressable>
          <Pressable
            style={[styles.primaryWideButton, savingDish || uploadingImage ? styles.buttonDisabled : null]}
            onPress={() => void saveDish()}
            disabled={savingDish || uploadingImage}
          >
            <Text style={styles.primaryButtonText}>{savingDish ? "..." : "Сохранить"}</Text>
          </Pressable>
        </View>

        {dishEditor.id ? (
          <View style={styles.destructiveBlock}>
            <Pressable style={styles.dangerWideButton} onPress={confirmDeleteEditedDish}>
              <Ionicons name="trash-outline" size={18} color="#B42318" />
              <Text style={styles.dangerWideButtonText}>Удалить блюдо</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <View style={styles.screen}>
        {isTablet ? (
          <View style={styles.tabletShell}>
            <View style={styles.tabletSidebar}>{categoriesScreen}</View>
            <View style={styles.tabletMain}>
              {categoryDetail}
              {dishEditorOpen ? <View style={styles.editorAside}>{dishEditorContent}</View> : null}
            </View>
          </View>
        ) : selectedCategoryId ? (
          categoryDetail
        ) : (
          categoriesScreen
        )}

        {categoryModal}

        {!isTablet ? (
          <Modal visible={dishEditorOpen} animationType="slide" onRequestClose={closeDishEditor}>
            <SafeAreaView style={styles.safeArea} edges={["top"]}>
              <KeyboardAvoidingView style={styles.modalScreen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
                {dishEditorContent}
              </KeyboardAvoidingView>
            </SafeAreaView>
          </Modal>
        ) : null}
      </View>
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
  tabletShell: {
    flex: 1,
    flexDirection: "row",
    gap: 14,
    padding: 14,
  },
  tabletSidebar: {
    width: 360,
    backgroundColor: colors.white,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "#DED7CA",
    overflow: "hidden",
  },
  tabletMain: {
    flex: 1,
    flexDirection: "row",
    gap: 14,
  },
  editorAside: {
    width: 420,
    backgroundColor: colors.white,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "#DED7CA",
    overflow: "hidden",
  },
  pageHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  title: {
    fontSize: 30,
    fontWeight: "800",
    color: colors.navyDeep,
  },
  subtitle: {
    marginTop: 4,
    color: colors.muted,
    fontSize: 14,
  },
  listContent: {
    padding: 16,
    gap: 14,
  },
  banner: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  errorBanner: {
    backgroundColor: "#FDECEA",
  },
  warningBanner: {
    backgroundColor: "#F6E8D0",
  },
  bannerText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
  errorBannerText: {
    color: "#B42318",
  },
  warningBannerText: {
    color: "#8A6123",
  },
  primaryButton: {
    minHeight: 46,
    borderRadius: 16,
    backgroundColor: colors.navy,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    flexDirection: "row",
    gap: 8,
  },
  primaryButtonText: {
    color: colors.white,
    fontWeight: "800",
    fontSize: 15,
  },
  secondaryButton: {
    minWidth: 44,
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  secondaryWideButton: {
    minHeight: 46,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    flexDirection: "row",
    gap: 8,
    flex: 1,
  },
  secondaryWideButtonText: {
    color: colors.navy,
    fontWeight: "700",
  },
  primaryWideButton: {
    minHeight: 46,
    borderRadius: 16,
    backgroundColor: colors.navy,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    flex: 1,
  },
  dangerWideButton: {
    minHeight: 46,
    borderRadius: 16,
    backgroundColor: "#FFF2F0",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    flexDirection: "row",
    gap: 8,
  },
  dangerWideButtonText: {
    color: "#B42318",
    fontWeight: "700",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  categoryCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#DED7CA",
    backgroundColor: colors.white,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    shadowColor: "#0A1F4A",
    shadowOpacity: 0.05,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 2,
  },
  categoryCardActive: {
    borderColor: "#B8CAE9",
    backgroundColor: "#FBFCFF",
  },
  categoryCover: {
    width: 88,
    height: 88,
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: "#F2ECE3",
    alignItems: "center",
    justifyContent: "center",
  },
  categoryCoverImage: {
    width: "100%",
    height: "100%",
  },
  categoryCopy: {
    flex: 1,
    gap: 6,
  },
  categoryTitle: {
    color: colors.navyDeep,
    fontSize: 22,
    fontWeight: "800",
    lineHeight: 27,
  },
  categoryHint: {
    color: colors.muted,
    fontSize: 15,
  },
  categoryActions: {
    gap: 8,
    alignItems: "center",
  },
  actionIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  actionIconAccent: {
    backgroundColor: "#EEF3FF",
    borderColor: "#CAD9F7",
  },
  actionIconDanger: {
    backgroundColor: "#FFF2F0",
    borderColor: "#F0CBC5",
  },
  emptyState: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    padding: 24,
    alignItems: "center",
    gap: 12,
  },
  emptyStateLarge: {
    flex: 1,
    margin: 14,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: "#EEF3FF",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    color: colors.navyDeep,
    fontSize: 19,
    fontWeight: "800",
    textAlign: "center",
  },
  detailShell: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "#DED7CA",
    overflow: "hidden",
  },
  detailHeader: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  detailHeaderMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  detailHeaderCopy: {
    flex: 1,
  },
  detailTitle: {
    color: colors.navyDeep,
    fontSize: 30,
    fontWeight: "800",
  },
  detailHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  detailScroll: {
    flex: 1,
  },
  overviewSection: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#D9D2C6",
    backgroundColor: colors.white,
    padding: 14,
    gap: 10,
  },
  overviewSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  sectionTitle: {
    color: colors.navyDeep,
    fontSize: 20,
    fontWeight: "800",
  },
  overviewDishRow: {
    minHeight: 62,
    borderRadius: 18,
    backgroundColor: "#FFFDF8",
    borderWidth: 1,
    borderColor: colors.line,
    padding: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  overviewDishImage: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: "#ECE7DE",
  },
  overviewDishCopy: {
    flex: 1,
    minWidth: 0,
  },
  overviewDishTitle: {
    color: colors.navyDeep,
    fontSize: 15,
    fontWeight: "800",
  },
  dishCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#D9D2C6",
    backgroundColor: colors.white,
    padding: 14,
    gap: 12,
    shadowColor: "#0A1F4A",
    shadowOpacity: 0.05,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  dishTopRow: {
    flexDirection: "row",
    gap: 14,
    alignItems: "center",
  },
  dishImage: {
    width: 92,
    height: 92,
    borderRadius: 20,
    backgroundColor: "#ECE7DE",
  },
  dishTopContent: {
    flex: 1,
    gap: 6,
    minWidth: 0,
  },
  dishTitleRow: {
    gap: 6,
  },
  dishName: {
    flex: 1,
    color: colors.navyDeep,
    fontSize: 20,
    fontWeight: "800",
    lineHeight: 25,
  },
  dishPrice: {
    color: colors.navyDeep,
    fontSize: 18,
    fontWeight: "800",
  },
  dishMiddleRow: {
    gap: 10,
  },
  dishDescription: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  dishDescriptionMuted: {
    color: colors.muted,
    fontSize: 14,
  },
  dishMeta: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  dot: {
    color: "#A09990",
    fontSize: 12,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  statusPillOn: {
    backgroundColor: "#EAF3DE",
  },
  statusPillOff: {
    backgroundColor: "#FDECEA",
  },
  statusPillText: {
    fontWeight: "700",
    fontSize: 13,
  },
  statusPillTextOn: {
    color: "#2D6A4F",
  },
  statusPillTextOff: {
    color: "#B42318",
  },
  softPill: {
    borderRadius: 999,
    backgroundColor: "#F4EFE5",
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  softPillText: {
    color: colors.navyDeep,
    fontSize: 13,
    fontWeight: "700",
  },
  dishActionsRow: {
    flexDirection: "row",
    gap: 10,
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(10, 20, 40, 0.28)",
    justifyContent: "center",
    padding: 16,
  },
  sheetWrap: {
    width: "100%",
    alignSelf: "center",
  },
  modalSheet: {
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    borderRadius: 28,
    backgroundColor: colors.cream,
    padding: 16,
    gap: 14,
  },
  modalScreen: {
    flex: 1,
  },
  editorPanel: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  editorContent: {
    padding: 16,
    gap: 14,
  },
  sheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    padding: 16,
    paddingBottom: 8,
  },
  sheetTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: colors.navyDeep,
  },
  sheetSectionTitle: {
    color: colors.navyDeep,
    fontWeight: "800",
    fontSize: 17,
  },
  fieldBlock: {
    gap: 8,
  },
  fieldLabel: {
    color: colors.navyDeep,
    fontWeight: "700",
    fontSize: 13,
  },
  input: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 15,
  },
  inputMultiline: {
    minHeight: 112,
    textAlignVertical: "top",
  },
  horizontalChipsContent: {
    gap: 8,
    paddingRight: 12,
  },
  choiceChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  choiceChipActive: {
    borderColor: colors.navy,
    backgroundColor: colors.navy,
  },
  choiceChipText: {
    color: colors.navy,
    fontWeight: "700",
  },
  choiceChipTextActive: {
    color: colors.white,
  },
  photoCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    padding: 12,
    gap: 12,
  },
  photoPlaceholder: {
    height: 210,
    borderRadius: 18,
    backgroundColor: "#F1ECE4",
    alignItems: "center",
    justifyContent: "center",
  },
  photoPreview: {
    width: "100%",
    height: 210,
    borderRadius: 18,
    backgroundColor: "#F1ECE4",
  },
  photoActions: {
    flexDirection: "row",
    gap: 8,
  },
  row: {
    flexDirection: "row",
    gap: 12,
  },
  rowItem: {
    flex: 1,
  },
  helperText: {
    color: colors.muted,
    fontSize: 13,
  },
  errorText: {
    color: "#B42318",
    fontSize: 13,
    fontWeight: "600",
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  destructiveBlock: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
});
