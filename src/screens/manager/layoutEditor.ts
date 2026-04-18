import type {
  FloorTableNode,
  FloorTableShape,
  FloorTableSizePreset,
  FloorZone,
} from "../../types/domain";

export const GRID_STEP = 5;
export const SNAP_THRESHOLD = 1.5;
export const CANVAS_PADDING_PX = 28;

type TableFootprint = {
  width: number;
  height: number;
};

const TABLE_FOOTPRINTS: Record<FloorTableSizePreset, Record<FloorTableShape, TableFootprint>> = {
  sm: {
    square: { width: 8, height: 8 },
    round: { width: 8, height: 8 },
    rect: { width: 12, height: 8 },
  },
  md: {
    square: { width: 10, height: 10 },
    round: { width: 10, height: 10 },
    rect: { width: 15, height: 10 },
  },
  lg: {
    square: { width: 12, height: 12 },
    round: { width: 12, height: 12 },
    rect: { width: 18, height: 12 },
  },
};

export function getTableFootprint(
  shape: FloorTableShape,
  sizePreset: FloorTableSizePreset = "md",
): TableFootprint {
  return TABLE_FOOTPRINTS[sizePreset][shape];
}

export function clamp(value: number, min: number, max: number) {
  if (Number.isNaN(value)) return min;
  return Math.min(Math.max(value, min), max);
}

export function softSnap(value: number, min: number, max: number, step = GRID_STEP, threshold = SNAP_THRESHOLD) {
  const snappedMin = Math.abs(value - min) <= threshold ? min : value;
  const snappedMax = Math.abs(snappedMin - max) <= threshold ? max : snappedMin;
  const nearestGrid = Math.round(snappedMax / step) * step;
  return Math.abs(snappedMax - nearestGrid) <= threshold ? nearestGrid : snappedMax;
}

export function clampAndSnapTablePosition(
  table: Pick<FloorTableNode, "x" | "y" | "shape" | "sizePreset">,
  nextX: number,
  nextY: number,
) {
  const footprint = getTableFootprint(table.shape, table.sizePreset);
  const x = clamp(nextX, 0, 100 - footprint.width);
  const y = clamp(nextY, 0, 100 - footprint.height);

  return {
    x: softSnap(x, 0, 100 - footprint.width),
    y: softSnap(y, 0, 100 - footprint.height),
  };
}

export function clampAndSnapZone(zone: FloorZone) {
  const width = clamp(zone.width, 8, 100);
  const height = clamp(zone.height, 8, 100);
  const x = clamp(zone.x, 0, 100 - width);
  const y = clamp(zone.y, 0, 100 - height);

  return {
    ...zone,
    x: softSnap(x, 0, 100 - width),
    y: softSnap(y, 0, 100 - height),
    width: softSnap(width, 8, 100 - x),
    height: softSnap(height, 8, 100 - y),
  };
}

export function normalizeTableNode(table: FloorTableNode): FloorTableNode {
  return {
    ...table,
    label: table.label?.trim() || undefined,
    sizePreset: table.sizePreset ?? "md",
  };
}

export function buildLayoutDraftKey(tables: FloorTableNode[], zones: FloorZone[]) {
  return JSON.stringify({
    tables: [...tables]
      .map(normalizeTableNode)
      .sort((a, b) => a.tableId - b.tableId)
      .map((table) => ({
        tableId: table.tableId,
        label: table.label || "",
        shape: table.shape,
        sizePreset: table.sizePreset,
        x: Number(table.x.toFixed(2)),
        y: Number(table.y.toFixed(2)),
      })),
    zones: [...zones]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((zone) => ({
        id: zone.id,
        label: zone.label.trim(),
        x: Number(zone.x.toFixed(2)),
        y: Number(zone.y.toFixed(2)),
        width: Number(zone.width.toFixed(2)),
        height: Number(zone.height.toFixed(2)),
      })),
  });
}

export function getLayoutBounds(tables: FloorTableNode[], zones: FloorZone[]) {
  const boxes = [
    ...tables.map((table) => {
      const footprint = getTableFootprint(table.shape, table.sizePreset);
      return {
        x: table.x,
        y: table.y,
        width: footprint.width,
        height: footprint.height,
      };
    }),
    ...zones.map((zone) => ({
      x: zone.x,
      y: zone.y,
      width: zone.width,
      height: zone.height,
    })),
  ];

  if (boxes.length === 0) {
    return { minX: 0, minY: 0, maxX: 100, maxY: 100 };
  }

  return boxes.reduce(
    (acc, box) => ({
      minX: Math.min(acc.minX, box.x),
      minY: Math.min(acc.minY, box.y),
      maxX: Math.max(acc.maxX, box.x + box.width),
      maxY: Math.max(acc.maxY, box.y + box.height),
    }),
    {
      minX: boxes[0].x,
      minY: boxes[0].y,
      maxX: boxes[0].x + boxes[0].width,
      maxY: boxes[0].y + boxes[0].height,
    },
  );
}

export function getVisibleCenterPercent(
  view: { scale: number; panX: number; panY: number },
  canvas: { width: number; height: number },
) {
  const localX = (canvas.width / 2 - view.panX) / (view.scale || 1);
  const localY = (canvas.height / 2 - view.panY) / (view.scale || 1);

  return {
    x: clamp((localX / Math.max(canvas.width, 1)) * 100, 0, 100),
    y: clamp((localY / Math.max(canvas.height, 1)) * 100, 0, 100),
  };
}

export function fitLayoutTransform(
  tables: FloorTableNode[],
  zones: FloorZone[],
  canvas: { width: number; height: number },
) {
  const bounds = getLayoutBounds(tables, zones);
  const boundsWidthPx = (bounds.maxX - bounds.minX) * (canvas.width / 100);
  const boundsHeightPx = (bounds.maxY - bounds.minY) * (canvas.height / 100);

  const fitScale = Math.min(
    2.4,
    Math.max(
      0.75,
      Math.min(
        (canvas.width - CANVAS_PADDING_PX * 2) / Math.max(boundsWidthPx, 1),
        (canvas.height - CANVAS_PADDING_PX * 2) / Math.max(boundsHeightPx, 1),
      ),
    ),
  );

  const centerXPx = ((bounds.minX + bounds.maxX) / 2 / 100) * canvas.width;
  const centerYPx = ((bounds.minY + bounds.maxY) / 2 / 100) * canvas.height;

  return {
    scale: fitScale,
    panX: canvas.width / 2 - centerXPx * fitScale,
    panY: canvas.height / 2 - centerYPx * fitScale,
  };
}

