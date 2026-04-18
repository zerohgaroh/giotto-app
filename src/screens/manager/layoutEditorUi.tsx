import { memo, useCallback } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS, useSharedValue, type SharedValue } from "react-native-reanimated";
import { colors } from "../../theme/colors";
import type {
  FloorTableNode,
  FloorTableShape,
  FloorTableSizePreset,
  FloorZone,
} from "../../types/domain";
import { clamp, getTableFootprint } from "./layoutEditor";

export const SHAPE_OPTIONS: Array<{ value: FloorTableShape; label: string }> = [
  { value: "round", label: "Круг" },
  { value: "square", label: "Квадрат" },
  { value: "rect", label: "Прямоугольник" },
];

export const SIZE_OPTIONS: Array<{ value: FloorTableSizePreset; label: string }> = [
  { value: "sm", label: "Маленький" },
  { value: "md", label: "Средний" },
  { value: "lg", label: "Большой" },
];

type StepperFieldProps = {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
};

export function StepperField({ label, value, onChange, min, max, step = 1 }: StepperFieldProps) {
  return (
    <View style={styles.groupBlock}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.stepperRow}>
        <Pressable style={styles.stepperButton} onPress={() => onChange(clamp(value - step, min, max))}>
          <Text style={styles.stepperButtonText}>-</Text>
        </Pressable>
        <TextInput
          value={String(Math.round(value * 10) / 10)}
          keyboardType="numeric"
          onChangeText={(text) => {
            const parsed = Number(text.replace(",", "."));
            if (Number.isNaN(parsed)) return;
            onChange(clamp(parsed, min, max));
          }}
          placeholderTextColor="#8A847A"
          style={styles.stepperInput}
        />
        <Pressable style={styles.stepperButton} onPress={() => onChange(clamp(value + step, min, max))}>
          <Text style={styles.stepperButtonText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

type ChoiceChipGroupProps<T extends string> = {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
};

export function ChoiceChipGroup<T extends string>({
  label,
  value,
  options,
  onChange,
}: ChoiceChipGroupProps<T>) {
  return (
    <View style={styles.groupBlock}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.chipsRow}>
        {options.map((option) => {
          const active = option.value === value;
          return (
            <Pressable
              key={option.value}
              style={[styles.choiceChip, active && styles.choiceChipActive]}
              onPress={() => onChange(option.value)}
            >
              <Text style={[styles.choiceChipText, active && styles.choiceChipTextActive]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

type DirectionPadProps = {
  onLeft: () => void;
  onUp: () => void;
  onRight: () => void;
  onDown: () => void;
};

export function DirectionPad({ onLeft, onUp, onRight, onDown }: DirectionPadProps) {
  return (
    <View style={styles.groupBlock}>
      <Text style={styles.fieldLabel}>Положение</Text>
      <View style={styles.directionGrid}>
        <Pressable style={styles.directionButton} onPress={onUp}>
          <Text style={styles.directionButtonText}>Выше</Text>
        </Pressable>
        <View style={styles.directionRow}>
          <Pressable style={styles.directionButton} onPress={onLeft}>
            <Text style={styles.directionButtonText}>Левее</Text>
          </Pressable>
          <Pressable style={styles.directionButton} onPress={onRight}>
            <Text style={styles.directionButtonText}>Правее</Text>
          </Pressable>
        </View>
        <Pressable style={styles.directionButton} onPress={onDown}>
          <Text style={styles.directionButtonText}>Ниже</Text>
        </Pressable>
      </View>
    </View>
  );
}

type TableNodeViewProps = {
  table: FloorTableNode;
  selected: boolean;
  canvasSize: { width: number; height: number };
  scaleValue: SharedValue<number>;
  onSelect: (tableId: number) => void;
  onMove: (tableId: number, x: number, y: number) => void;
};

function TableNodeViewImpl({
  table,
  selected,
  canvasSize,
  scaleValue,
  onSelect,
  onMove,
}: TableNodeViewProps) {
  const startX = useSharedValue(table.x);
  const startY = useSharedValue(table.y);
  const footprint = getTableFootprint(table.shape, table.sizePreset);

  const tapGesture = Gesture.Tap().onEnd(() => {
    runOnJS(onSelect)(table.tableId);
  });

  const dragGesture = Gesture.Pan()
    .onBegin(() => {
      startX.value = table.x;
      startY.value = table.y;
      runOnJS(onSelect)(table.tableId);
    })
    .onUpdate((event) => {
      const nextX = startX.value + (event.translationX / Math.max(canvasSize.width * scaleValue.value, 1)) * 100;
      const nextY = startY.value + (event.translationY / Math.max(canvasSize.height * scaleValue.value, 1)) * 100;
      runOnJS(onMove)(table.tableId, nextX, nextY);
    });

  const gesture = Gesture.Simultaneous(dragGesture, tapGesture);

  return (
    <GestureDetector gesture={gesture}>
      <View
        style={[
          styles.tableNode,
          table.shape === "round" && styles.tableNodeRound,
          table.shape === "rect" && styles.tableNodeRect,
          selected && styles.tableNodeSelected,
          {
            left: `${table.x}%`,
            top: `${table.y}%`,
            width: `${footprint.width}%`,
            height: `${footprint.height}%`,
          },
        ]}
      >
        <Text style={styles.tableNodeText}>{table.label || `Стол ${table.tableId}`}</Text>
      </View>
    </GestureDetector>
  );
}

export const TableNodeView = memo(TableNodeViewImpl);

type ZoneNodeViewProps = {
  zone: FloorZone;
  selected: boolean;
  canvasSize: { width: number; height: number };
  scaleValue: SharedValue<number>;
  onSelect: (zoneId: string) => void;
  onMove: (zoneId: string, zone: FloorZone) => void;
  onResize: (zoneId: string, zone: FloorZone) => void;
};

function ZoneNodeViewImpl({
  zone,
  selected,
  canvasSize,
  scaleValue,
  onSelect,
  onMove,
  onResize,
}: ZoneNodeViewProps) {
  const startX = useSharedValue(zone.x);
  const startY = useSharedValue(zone.y);
  const startWidth = useSharedValue(zone.width);
  const startHeight = useSharedValue(zone.height);

  const selectZone = useCallback(() => onSelect(zone.id), [onSelect, zone.id]);

  const dragGesture = Gesture.Pan()
    .onBegin(() => {
      startX.value = zone.x;
      startY.value = zone.y;
      runOnJS(selectZone)();
    })
    .onUpdate((event) => {
      const next = {
        ...zone,
        x: startX.value + (event.translationX / Math.max(canvasSize.width * scaleValue.value, 1)) * 100,
        y: startY.value + (event.translationY / Math.max(canvasSize.height * scaleValue.value, 1)) * 100,
      };
      runOnJS(onMove)(zone.id, next);
    });

  const tapGesture = Gesture.Tap().onEnd(() => {
    runOnJS(selectZone)();
  });

  const makeHandleGesture = (anchor: "topLeft" | "topRight" | "bottomLeft" | "bottomRight") =>
    Gesture.Pan()
      .onBegin(() => {
        startX.value = zone.x;
        startY.value = zone.y;
        startWidth.value = zone.width;
        startHeight.value = zone.height;
        runOnJS(selectZone)();
      })
      .onUpdate((event) => {
        const deltaX = (event.translationX / Math.max(canvasSize.width * scaleValue.value, 1)) * 100;
        const deltaY = (event.translationY / Math.max(canvasSize.height * scaleValue.value, 1)) * 100;

        let next = {
          ...zone,
          x: startX.value,
          y: startY.value,
          width: startWidth.value,
          height: startHeight.value,
        };

        if (anchor === "topLeft") {
          next = {
            ...next,
            x: startX.value + deltaX,
            y: startY.value + deltaY,
            width: startWidth.value - deltaX,
            height: startHeight.value - deltaY,
          };
        }

        if (anchor === "topRight") {
          next = {
            ...next,
            y: startY.value + deltaY,
            width: startWidth.value + deltaX,
            height: startHeight.value - deltaY,
          };
        }

        if (anchor === "bottomLeft") {
          next = {
            ...next,
            x: startX.value + deltaX,
            width: startWidth.value - deltaX,
            height: startHeight.value + deltaY,
          };
        }

        if (anchor === "bottomRight") {
          next = {
            ...next,
            width: startWidth.value + deltaX,
            height: startHeight.value + deltaY,
          };
        }

        runOnJS(onResize)(zone.id, next);
      });

  return (
    <GestureDetector gesture={Gesture.Simultaneous(dragGesture, tapGesture)}>
      <View
        style={[
          styles.zoneNode,
          selected && styles.zoneNodeSelected,
          {
            left: `${zone.x}%`,
            top: `${zone.y}%`,
            width: `${zone.width}%`,
            height: `${zone.height}%`,
          },
        ]}
      >
        <Text style={styles.zoneNodeLabel}>{zone.label}</Text>

        {selected ? (
          <>
            {(["topLeft", "topRight", "bottomLeft", "bottomRight"] as const).map((anchor) => (
              <GestureDetector key={anchor} gesture={makeHandleGesture(anchor)}>
                <View
                  style={[
                    styles.zoneHandle,
                    anchor === "topLeft" && styles.zoneHandleTopLeft,
                    anchor === "topRight" && styles.zoneHandleTopRight,
                    anchor === "bottomLeft" && styles.zoneHandleBottomLeft,
                    anchor === "bottomRight" && styles.zoneHandleBottomRight,
                  ]}
                />
              </GestureDetector>
            ))}
          </>
        ) : null}
      </View>
    </GestureDetector>
  );
}

export const ZoneNodeView = memo(ZoneNodeViewImpl);

const styles = StyleSheet.create({
  groupBlock: {
    gap: 8,
  },
  fieldLabel: {
    color: colors.navyDeep,
    fontWeight: "700",
    fontSize: 13,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  choiceChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  choiceChipActive: {
    borderColor: colors.navy,
    backgroundColor: colors.navy,
  },
  choiceChipText: {
    color: colors.navy,
    fontWeight: "600",
    fontSize: 12,
  },
  choiceChipTextActive: {
    color: colors.white,
  },
  directionGrid: {
    gap: 8,
  },
  directionRow: {
    flexDirection: "row",
    gap: 8,
  },
  directionButton: {
    minHeight: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  directionButtonText: {
    color: colors.navy,
    fontWeight: "600",
    fontSize: 12,
  },
  stepperRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  stepperButton: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  stepperButtonText: {
    color: colors.navy,
    fontWeight: "700",
    fontSize: 18,
  },
  stepperInput: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: colors.text,
    textAlign: "center",
  },
  tableNode: {
    position: "absolute",
    borderRadius: 14,
    backgroundColor: colors.navy,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.navy,
  },
  tableNodeRound: {
    borderRadius: 999,
  },
  tableNodeRect: {
    borderRadius: 10,
  },
  tableNodeSelected: {
    borderColor: colors.gold,
    shadowColor: "#0D2B6B",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  tableNodeText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
  },
  zoneNode: {
    position: "absolute",
    borderRadius: 14,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "#BEA36C",
    backgroundColor: "rgba(214, 192, 143, 0.22)",
    padding: 10,
  },
  zoneNodeSelected: {
    borderColor: colors.navy,
    backgroundColor: "rgba(13, 43, 107, 0.08)",
  },
  zoneNodeLabel: {
    color: "#6C5326",
    fontSize: 12,
    fontWeight: "700",
  },
  zoneHandle: {
    position: "absolute",
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.white,
    backgroundColor: colors.navy,
  },
  zoneHandleTopLeft: {
    top: -8,
    left: -8,
  },
  zoneHandleTopRight: {
    top: -8,
    right: -8,
  },
  zoneHandleBottomLeft: {
    left: -8,
    bottom: -8,
  },
  zoneHandleBottomRight: {
    right: -8,
    bottom: -8,
  },
});
