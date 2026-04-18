import type { Dish, ManagerMenuSnapshot } from "../../types/domain";

export const CATEGORY_ICON_OPTIONS = [""] as const;

export const BADGE_TONE_OPTIONS = [
  { value: "gold", label: "Золото" },
  { value: "navy", label: "Синий" },
  { value: "sage", label: "Зелёный" },
  { value: "blush", label: "Розовый" },
] as const;

export function countDishesByCategory(dishes: Dish[]) {
  return dishes.reduce<Record<string, number>>((acc, dish) => {
    acc[dish.category] = (acc[dish.category] || 0) + 1;
    return acc;
  }, {});
}

export function getCategoryCoverImage(menu: ManagerMenuSnapshot | null, categoryId: string) {
  if (!menu) return "";
  return menu.dishes.find((dish) => dish.category === categoryId)?.image || "";
}

export function normalizePriceInput(value: string) {
  const digits = value.replace(/[^\d]/g, "");
  if (!digits) return "";
  return String(Math.max(0, Number(digits)));
}

export function normalizeCaloriesInput(value: string) {
  return normalizePriceInput(value);
}

export function normalizePortionInput(value: string) {
  return value.replace(/\s+/g, " ").trim();
}
