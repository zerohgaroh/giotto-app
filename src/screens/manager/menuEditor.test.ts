import assert from "node:assert/strict";
import test from "node:test";
import {
  countDishesByCategory,
  getCategoryCoverImage,
  normalizeCaloriesInput,
  normalizePortionInput,
  normalizePriceInput,
} from "./menuEditor";

test("countDishesByCategory groups dishes by category", () => {
  const counts = countDishesByCategory([
    {
      id: "1",
      category: "pasta",
      nameIt: "Pasta",
      nameRu: "Паста",
      description: "",
      price: 10,
      image: "a",
      portion: "250 г",
      energyKcal: 300,
    },
    {
      id: "2",
      category: "pasta",
      nameIt: "Ravioli",
      nameRu: "Равиоли",
      description: "",
      price: 12,
      image: "b",
      portion: "250 г",
      energyKcal: 320,
    },
    {
      id: "3",
      category: "dessert",
      nameIt: "Tiramisu",
      nameRu: "Тирамису",
      description: "",
      price: 8,
      image: "c",
      portion: "160 г",
      energyKcal: 280,
    },
  ]);

  assert.deepEqual(counts, { pasta: 2, dessert: 1 });
});

test("getCategoryCoverImage returns first image for category", () => {
  const image = getCategoryCoverImage(
    {
      categories: [],
      dishes: [
        {
          id: "1",
          category: "pasta",
          nameIt: "Pasta",
          nameRu: "Паста",
          description: "",
          price: 10,
          image: "cover-a",
          portion: "250 г",
          energyKcal: 300,
        },
        {
          id: "2",
          category: "pasta",
          nameIt: "Ravioli",
          nameRu: "Равиоли",
          description: "",
          price: 12,
          image: "cover-b",
          portion: "250 г",
          energyKcal: 320,
        },
      ],
    },
    "pasta",
  );

  assert.equal(image, "cover-a");
});

test("normalizePriceInput keeps only positive digits", () => {
  assert.equal(normalizePriceInput("12 500 сум"), "12500");
  assert.equal(normalizePriceInput("-99"), "99");
  assert.equal(normalizePriceInput(""), "");
});

test("normalizeCaloriesInput reuses numeric normalization", () => {
  assert.equal(normalizeCaloriesInput("480 ккал"), "480");
});

test("normalizePortionInput trims repeated spaces but keeps text", () => {
  assert.equal(normalizePortionInput("  250   г  "), "250 г");
});
