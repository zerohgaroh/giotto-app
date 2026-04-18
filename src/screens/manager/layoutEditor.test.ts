import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLayoutDraftKey,
  clampAndSnapTablePosition,
  clampAndSnapZone,
  fitLayoutTransform,
  getTableFootprint,
  getVisibleCenterPercent,
} from "./layoutEditor";

test("getTableFootprint returns expected presets", () => {
  assert.deepEqual(getTableFootprint("rect", "lg"), { width: 18, height: 12 });
  assert.deepEqual(getTableFootprint("round", "sm"), { width: 8, height: 8 });
});

test("clampAndSnapTablePosition keeps table inside bounds", () => {
  const next = clampAndSnapTablePosition(
    { x: 0, y: 0, shape: "rect", sizePreset: "lg" },
    94.7,
    -2,
  );

  assert.equal(next.x, 82);
  assert.equal(next.y, 0);
});

test("clampAndSnapZone respects size minimums and bounds", () => {
  const next = clampAndSnapZone({
    id: "zone-a",
    label: "A",
    x: 97,
    y: 96,
    width: 4,
    height: 5,
  });

  assert.equal(next.width >= 8, true);
  assert.equal(next.height >= 8, true);
  assert.equal(next.x <= 92, true);
  assert.equal(next.y <= 92, true);
});

test("buildLayoutDraftKey ignores table ordering", () => {
  const first = buildLayoutDraftKey(
    [
      { tableId: 2, label: "B", x: 10, y: 20, shape: "square", sizePreset: "md" },
      { tableId: 1, label: "A", x: 12, y: 22, shape: "round", sizePreset: "sm" },
    ],
    [{ id: "zone-main", label: "Hall", x: 0, y: 0, width: 50, height: 50 }],
  );

  const second = buildLayoutDraftKey(
    [
      { tableId: 1, label: "A", x: 12, y: 22, shape: "round", sizePreset: "sm" },
      { tableId: 2, label: "B", x: 10, y: 20, shape: "square", sizePreset: "md" },
    ],
    [{ id: "zone-main", label: "Hall", x: 0, y: 0, width: 50, height: 50 }],
  );

  assert.equal(first, second);
});

test("getVisibleCenterPercent accounts for pan and zoom", () => {
  const center = getVisibleCenterPercent(
    { scale: 2, panX: -120, panY: -80 },
    { width: 400, height: 300 },
  );

  assert.equal(center.x, 40);
  assert.equal(center.y, 38.333333333333336);
});

test("fitLayoutTransform returns a usable scale", () => {
  const next = fitLayoutTransform(
    [{ tableId: 1, label: "A", x: 20, y: 20, shape: "square", sizePreset: "md" }],
    [{ id: "zone-a", label: "Main", x: 10, y: 10, width: 50, height: 40 }],
    { width: 360, height: 420 },
  );

  assert.equal(next.scale > 0.75, true);
  assert.equal(Number.isFinite(next.panX), true);
  assert.equal(Number.isFinite(next.panY), true);
});
