import { useNavigation } from "@react-navigation/native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  LayoutChangeEvent,
  Pressable,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  archiveManagerTable,
  createManagerTable,
  fetchManagerLayout,
  restoreManagerTable,
  updateManagerLayout,
} from "../../api/client";
import { useStaffRealtime } from "../../realtime/useStaffRealtime";
import type { FloorTableNode, FloorZone, ManagerLayoutSnapshot } from "../../types/domain";
import {
  buildLayoutDraftKey,
  clampAndSnapTablePosition,
  clampAndSnapZone,
  fitLayoutTransform,
  getVisibleCenterPercent,
  normalizeTableNode,
} from "./layoutEditor";
import { styles } from "./layoutEditorScreenStyles";
import {
  ChoiceChipGroup,
  DirectionPad,
  SHAPE_OPTIONS,
  SIZE_OPTIONS,
  StepperField,
  TableNodeView,
  ZoneNodeView,
} from "./layoutEditorUi";

type SelectedItem =
  | { type: "table"; id: number }
  | { type: "zone"; id: string }
  | null;

type ArchiveListItem = FloorTableNode & {
  state: "archived" | "pending_archive";
};

function normalizeSnapshot(snapshot: ManagerLayoutSnapshot): ManagerLayoutSnapshot {
  return {
    activeTables: snapshot.activeTables.map(normalizeTableNode),
    archivedTables: snapshot.archivedTables.map(normalizeTableNode),
    zones: snapshot.zones.map(clampAndSnapZone),
  };
}

function createDraftZone(id: string, center: { x: number; y: number }): FloorZone {
  return clampAndSnapZone({
    id,
    label: "Новая зона",
    x: center.x - 12,
    y: center.y - 9,
    width: 24,
    height: 18,
  });
}

function createDraftTable(id: number, label: string, center: { x: number; y: number }): FloorTableNode {
  const table: FloorTableNode = {
    tableId: id,
    label,
    x: center.x,
    y: center.y,
    shape: "square",
    sizePreset: "md",
  };
  return {
    ...table,
    ...clampAndSnapTablePosition(table, center.x - 5, center.y - 5),
  };
}

export function ManagerLayoutScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = width >= 900;

  const [layout, setLayout] = useState<ManagerLayoutSnapshot | null>(null);
  const [draftTables, setDraftTables] = useState<FloorTableNode[]>([]);
  const [draftZones, setDraftZones] = useState<FloorZone[]>([]);
  const [selected, setSelected] = useState<SelectedItem>(null);
  const [pendingArchivedTableIds, setPendingArchivedTableIds] = useState<number[]>([]);
  const [pendingRestoredTableIds, setPendingRestoredTableIds] = useState<number[]>([]);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [externalChanged, setExternalChanged] = useState(false);

  const scale = useSharedValue(1);
  const panX = useSharedValue(0);
  const panY = useSharedValue(0);
  const panStartX = useSharedValue(0);
  const panStartY = useSharedValue(0);
  const pinchStartScale = useSharedValue(1);
  const pinchStartPanX = useSharedValue(0);
  const pinchStartPanY = useSharedValue(0);
  const pinchFocalX = useSharedValue(0);
  const pinchFocalY = useSharedValue(0);

  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  const viewStateRef = useRef({ scale: 1, panX: 0, panY: 0 });
  const tempTableIdRef = useRef(-1);
  const zoneCounterRef = useRef(0);
  const hasInitialFitRef = useRef(false);

  const draftKey = useMemo(() => buildLayoutDraftKey(draftTables, draftZones), [draftTables, draftZones]);
  const serverKey = useMemo(
    () => (layout ? buildLayoutDraftKey(layout.activeTables, layout.zones) : ""),
    [layout],
  );
  const dirty =
    !!layout &&
    (draftKey !== serverKey || pendingArchivedTableIds.length > 0 || pendingRestoredTableIds.length > 0);

  dirtyRef.current = dirty;
  savingRef.current = saving;

  const tableById = useMemo(() => new Map(draftTables.map((table) => [table.tableId, table])), [draftTables]);
  const zoneById = useMemo(() => new Map(draftZones.map((zone) => [zone.id, zone])), [draftZones]);
  const selectedTable = selected?.type === "table" ? tableById.get(selected.id) ?? null : null;
  const selectedZone = selected?.type === "zone" ? zoneById.get(selected.id) ?? null : null;

  const syncViewState = useCallback((nextScale: number, nextPanX: number, nextPanY: number) => {
    viewStateRef.current = { scale: nextScale, panX: nextPanX, panY: nextPanY };
  }, []);

  const animateViewState = useCallback(
    (next: { scale: number; panX: number; panY: number }) => {
      scale.value = withTiming(next.scale, { duration: 180 });
      panX.value = withTiming(next.panX, { duration: 180 });
      panY.value = withTiming(next.panY, { duration: 180 });
      syncViewState(next.scale, next.panX, next.panY);
    },
    [panX, panY, scale, syncViewState],
  );

  const fitToPlan = useCallback(
    (tables: FloorTableNode[] = draftTables, zones: FloorZone[] = draftZones) => {
      if (canvasSize.width === 0 || canvasSize.height === 0) return;
      animateViewState(fitLayoutTransform(tables, zones, canvasSize));
    },
    [animateViewState, canvasSize, draftTables, draftZones],
  );

  const applyServerSnapshot = useCallback(
    (snapshot: ManagerLayoutSnapshot, options?: { fit?: boolean }) => {
      const normalized = normalizeSnapshot(snapshot);
      setLayout(normalized);
      setDraftTables(normalized.activeTables);
      setDraftZones(normalized.zones);
      setPendingArchivedTableIds([]);
      setPendingRestoredTableIds([]);
      setExternalChanged(false);
      setErrorText("");
      setSelected((current) => {
        if (!current) return null;
        if (current.type === "table" && normalized.activeTables.some((table) => table.tableId === current.id)) return current;
        if (current.type === "zone" && normalized.zones.some((zone) => zone.id === current.id)) return current;
        return null;
      });
      if (options?.fit && canvasSize.width > 0 && canvasSize.height > 0) {
        requestAnimationFrame(() => fitToPlan(normalized.activeTables, normalized.zones));
      }
    },
    [canvasSize.height, canvasSize.width, fitToPlan],
  );

  const pull = useCallback(
    async (options?: { fit?: boolean }) => {
      const next = normalizeSnapshot(await fetchManagerLayout());
      if (dirtyRef.current || savingRef.current) {
        setLayout(next);
        setExternalChanged(true);
        return;
      }
      applyServerSnapshot(next, options);
    },
    [applyServerSnapshot],
  );

  useEffect(() => {
    setLoading(true);
    void (async () => {
      try {
        await pull({ fit: true });
      } catch {
        setErrorText("Не удалось загрузить план.");
      } finally {
        setLoading(false);
      }
    })();
  }, [pull]);

  useEffect(() => {
    if (!layout || hasInitialFitRef.current || canvasSize.width === 0 || canvasSize.height === 0) return;
    hasInitialFitRef.current = true;
    fitToPlan(layout.activeTables, layout.zones);
  }, [canvasSize.height, canvasSize.width, fitToPlan, layout]);

  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", (event) => {
      if (!dirtyRef.current || savingRef.current) return;
      event.preventDefault();
      Alert.alert("Есть несохранённые изменения", "Они пропадут, если выйти сейчас.", [
        { text: "Остаться", style: "cancel" },
        { text: "Выйти", style: "destructive", onPress: () => navigation.dispatch(event.data.action) },
      ]);
    });
    return unsubscribe;
  }, [navigation]);

  useEffect(() => {
    if (selected?.type === "table" && !draftTables.some((table) => table.tableId === selected.id)) setSelected(null);
    if (selected?.type === "zone" && !draftZones.some((zone) => zone.id === selected.id)) setSelected(null);
  }, [draftTables, draftZones, selected]);

  const { connected } = useStaffRealtime(
    useCallback(
      (event) => {
        if (
          event.type === "floor:layout_changed" ||
          event.type === "table:created" ||
          event.type === "table:archived" ||
          event.type === "table:restored"
        ) {
          void pull();
        }
      },
      [pull],
    ),
  );

  const moveTable = useCallback((tableId: number, x: number, y: number) => {
    setDraftTables((current) =>
      current.map((table) => {
        if (table.tableId !== tableId) return table;
        return { ...table, ...clampAndSnapTablePosition(table, x, y) };
      }),
    );
  }, []);

  const moveZone = useCallback((zoneId: string, zone: FloorZone) => {
    setDraftZones((current) => current.map((item) => (item.id === zoneId ? clampAndSnapZone(zone) : item)));
  }, []);

  const visibleCenter = useCallback(() => {
    if (canvasSize.width === 0 || canvasSize.height === 0) return { x: 50, y: 50 };
    return getVisibleCenterPercent(viewStateRef.current, canvasSize);
  }, [canvasSize]);

  const addTable = useCallback(() => {
    const maxTableId = Math.max(0, ...draftTables.filter((table) => table.tableId > 0).map((table) => table.tableId));
    const next = createDraftTable(tempTableIdRef.current, `Стол ${maxTableId + 1}`, visibleCenter());
    tempTableIdRef.current -= 1;
    setDraftTables((current) => [...current, next].sort((a, b) => a.tableId - b.tableId));
    setSelected({ type: "table", id: next.tableId });
  }, [draftTables, visibleCenter]);

  const addZone = useCallback(() => {
    zoneCounterRef.current += 1;
    const next = createDraftZone(`zone-${Date.now()}-${zoneCounterRef.current}`, visibleCenter());
    setDraftZones((current) => [...current, next]);
    setSelected({ type: "zone", id: next.id });
  }, [visibleCenter]);

  const removeTable = useCallback(
    (tableId: number) => {
      setDraftTables((current) => current.filter((table) => table.tableId !== tableId));
      if (tableId < 0) return;
      if (pendingRestoredTableIds.includes(tableId)) {
        setPendingRestoredTableIds((current) => current.filter((id) => id !== tableId));
      } else {
        setPendingArchivedTableIds((current) => (current.includes(tableId) ? current : [...current, tableId]));
      }
      setSelected(null);
    },
    [pendingRestoredTableIds],
  );

  const restoreArchivedTable = useCallback(
    (tableId: number) => {
      if (!layout) return;
      const fromPendingArchive = pendingArchivedTableIds.includes(tableId);
      const activeSource = layout.activeTables.find((table) => table.tableId === tableId);
      const archivedSource = layout.archivedTables.find((table) => table.tableId === tableId);

      if (fromPendingArchive && activeSource) {
        setPendingArchivedTableIds((current) => current.filter((id) => id !== tableId));
        setDraftTables((current) => [...current, activeSource].sort((a, b) => a.tableId - b.tableId));
        setSelected({ type: "table", id: tableId });
        return;
      }

      if (archivedSource) {
        setPendingRestoredTableIds((current) => (current.includes(tableId) ? current : [...current, tableId]));
        setDraftTables((current) => [...current, archivedSource].sort((a, b) => a.tableId - b.tableId));
        setSelected({ type: "table", id: tableId });
      }
    },
    [layout, pendingArchivedTableIds],
  );

  const saveLayoutDraft = useCallback(async () => {
    if (!layout || saving) return;
    setSaving(true);
    try {
      for (const tableId of pendingArchivedTableIds) await archiveManagerTable(tableId);
      for (const tableId of pendingRestoredTableIds) await restoreManagerTable(tableId);

      const persistedTables = draftTables.filter((table) => table.tableId > 0).map(normalizeTableNode);
      const tempTables = draftTables.filter((table) => table.tableId < 0).map(normalizeTableNode);
      const knownIds = new Set<number>([
        ...layout.activeTables.map((table) => table.tableId),
        ...layout.archivedTables.map((table) => table.tableId),
      ]);
      const createdTables: FloorTableNode[] = [];

      for (const table of tempTables) {
        const snapshot = normalizeSnapshot(
          await createManagerTable({
            label: table.label,
            x: table.x,
            y: table.y,
            shape: table.shape,
            sizePreset: table.sizePreset,
          }),
        );
        const created = snapshot.activeTables.find((candidate) => !knownIds.has(candidate.tableId));
        if (!created) throw new Error("create failed");
        knownIds.add(created.tableId);
        createdTables.push({ ...created, label: table.label, x: table.x, y: table.y, shape: table.shape, sizePreset: table.sizePreset });
      }

      await updateManagerLayout({
        tables: [...persistedTables, ...createdTables].map((table) => ({
          tableId: table.tableId,
          label: table.label,
          x: table.x,
          y: table.y,
          shape: table.shape,
          sizePreset: table.sizePreset,
        })),
        zones: draftZones.map(clampAndSnapZone),
      });

      const next = normalizeSnapshot(await fetchManagerLayout());
      applyServerSnapshot(next);
      requestAnimationFrame(() => fitToPlan(next.activeTables, next.zones));
    } catch {
      setErrorText("Не удалось сохранить план.");
      try {
        setLayout(normalizeSnapshot(await fetchManagerLayout()));
        setExternalChanged(true);
      } catch {
        // keep local draft
      }
    } finally {
      setSaving(false);
    }
  }, [applyServerSnapshot, draftTables, draftZones, fitToPlan, layout, pendingArchivedTableIds, pendingRestoredTableIds, saving]);

  const archiveItems = useMemo<ArchiveListItem[]>(() => {
    if (!layout) return [];
    return [
      ...layout.archivedTables
        .filter((table) => !pendingRestoredTableIds.includes(table.tableId))
        .map((table) => ({ ...table, state: "archived" as const })),
      ...layout.activeTables
        .filter((table) => pendingArchivedTableIds.includes(table.tableId))
        .map((table) => ({ ...table, state: "pending_archive" as const })),
    ].sort((a, b) => a.tableId - b.tableId);
  }, [layout, pendingArchivedTableIds, pendingRestoredTableIds]);

  const gesture = useMemo(() => {
    const tap = Gesture.Tap().onEnd(() => runOnJS(setSelected)(null));
    const doubleTap = Gesture.Tap().numberOfTaps(2).onEnd(() => runOnJS(fitToPlan)());
    const pan = Gesture.Pan()
      .onBegin(() => {
        panStartX.value = panX.value;
        panStartY.value = panY.value;
      })
      .onUpdate((event) => {
        panX.value = panStartX.value + event.translationX;
        panY.value = panStartY.value + event.translationY;
      })
      .onEnd(() => runOnJS(syncViewState)(scale.value, panX.value, panY.value));
    const pinch = Gesture.Pinch()
      .onBegin((event) => {
        pinchStartScale.value = scale.value;
        pinchStartPanX.value = panX.value;
        pinchStartPanY.value = panY.value;
        pinchFocalX.value = event.focalX;
        pinchFocalY.value = event.focalY;
      })
      .onUpdate((event) => {
        const nextScale = Math.max(0.65, Math.min(2.8, pinchStartScale.value * event.scale));
        const contentX = (pinchFocalX.value - pinchStartPanX.value) / Math.max(pinchStartScale.value, 0.0001);
        const contentY = (pinchFocalY.value - pinchStartPanY.value) / Math.max(pinchStartScale.value, 0.0001);
        scale.value = nextScale;
        panX.value = pinchFocalX.value - contentX * nextScale;
        panY.value = pinchFocalY.value - contentY * nextScale;
      })
      .onEnd(() => runOnJS(syncViewState)(scale.value, panX.value, panY.value));
    return Gesture.Simultaneous(pan, pinch, Gesture.Exclusive(doubleTap, tap));
  }, [fitToPlan, panStartX, panStartY, panX, panY, pinchFocalX, pinchFocalY, pinchStartPanX, pinchStartPanY, pinchStartScale, scale, syncViewState]);

  const animatedCanvasStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: panX.value }, { translateY: panY.value }, { scale: scale.value }],
  }));

  const handleCanvasLayout = useCallback((event: LayoutChangeEvent) => {
    const { width: nextWidth, height: nextHeight } = event.nativeEvent.layout;
    setCanvasSize((current) => (current.width === nextWidth && current.height === nextHeight ? current : { width: nextWidth, height: nextHeight }));
  }, []);

  const inspector = (
    <ScrollView
      style={styles.inspectorScroll}
      contentContainerStyle={[styles.inspectorContent, !isTablet && { paddingBottom: insets.bottom + 20 }]}
      keyboardShouldPersistTaps="handled"
    >
      {selectedTable ? (
        <>
          <View style={styles.inspectorCard}>
            <Text style={styles.inspectorTitle}>Стол</Text>
            <TextInput
              value={selectedTable.label || ""}
              onChangeText={(label) => setDraftTables((current) => current.map((table) => (table.tableId === selectedTable.tableId ? { ...table, label } : table)))}
              placeholder="Название стола"
              placeholderTextColor="#8A847A"
              style={styles.input}
            />
            <ChoiceChipGroup label="Форма стола" value={selectedTable.shape} options={SHAPE_OPTIONS} onChange={(shape) => setDraftTables((current) => current.map((table) => (table.tableId === selectedTable.tableId ? { ...table, shape, ...clampAndSnapTablePosition({ ...table, shape }, table.x, table.y) } : table)))} />
            <ChoiceChipGroup label="Размер стола" value={selectedTable.sizePreset} options={SIZE_OPTIONS} onChange={(sizePreset) => setDraftTables((current) => current.map((table) => (table.tableId === selectedTable.tableId ? { ...table, sizePreset, ...clampAndSnapTablePosition({ ...table, sizePreset }, table.x, table.y) } : table)))} />
            <DirectionPad onLeft={() => moveTable(selectedTable.tableId, selectedTable.x - 1, selectedTable.y)} onUp={() => moveTable(selectedTable.tableId, selectedTable.x, selectedTable.y - 1)} onRight={() => moveTable(selectedTable.tableId, selectedTable.x + 1, selectedTable.y)} onDown={() => moveTable(selectedTable.tableId, selectedTable.x, selectedTable.y + 1)} />
            <Text style={styles.helperText}>Перетащите стол на схеме или подвиньте его кнопками.</Text>
            <Pressable style={styles.dangerButton} onPress={() => removeTable(selectedTable.tableId)}>
              <Text style={styles.dangerButtonText}>Убрать стол</Text>
            </Pressable>
          </View>
        </>
      ) : null}

      {selectedZone ? (
        <View style={styles.inspectorCard}>
          <Text style={styles.inspectorTitle}>Зона</Text>
          <TextInput value={selectedZone.label} onChangeText={(label) => moveZone(selectedZone.id, { ...selectedZone, label })} placeholder="Название зоны" placeholderTextColor="#8A847A" style={styles.input} />
          <StepperField label="Положение по горизонтали" value={selectedZone.x} min={0} max={100 - selectedZone.width} onChange={(x) => moveZone(selectedZone.id, { ...selectedZone, x })} />
          <StepperField label="Положение по вертикали" value={selectedZone.y} min={0} max={100 - selectedZone.height} onChange={(y) => moveZone(selectedZone.id, { ...selectedZone, y })} />
          <StepperField label="Ширина зоны" value={selectedZone.width} min={8} max={100 - selectedZone.x} onChange={(widthValue) => moveZone(selectedZone.id, { ...selectedZone, width: widthValue })} />
          <StepperField label="Высота зоны" value={selectedZone.height} min={8} max={100 - selectedZone.y} onChange={(heightValue) => moveZone(selectedZone.id, { ...selectedZone, height: heightValue })} />
          <Text style={styles.helperText}>Зону можно двигать целиком и растягивать за углы.</Text>
          <Pressable style={styles.dangerButton} onPress={() => setDraftZones((current) => current.filter((zone) => zone.id !== selectedZone.id))}>
            <Text style={styles.dangerButtonText}>Удалить зону</Text>
          </Pressable>
        </View>
      ) : null}

      {!selectedTable && !selectedZone ? (
        <View style={styles.inspectorCard}>
          <Text style={styles.inspectorTitle}>Параметры</Text>
          <Text style={styles.helperText}>Выберите стол или зону на схеме.</Text>
        </View>
      ) : null}
    </ScrollView>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerState}>
          <Text style={styles.meta}>Загрузка...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>План</Text>
            <Text style={styles.subtitle}>Редактор зала</Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable style={styles.secondaryButton} onPress={addTable}><Text style={styles.secondaryButtonText}>Добавить стол</Text></Pressable>
            <Pressable style={styles.secondaryButton} onPress={addZone}><Text style={styles.secondaryButtonText}>Добавить зону</Text></Pressable>
            <Pressable style={styles.secondaryButton} onPress={() => fitToPlan()}><Text style={styles.secondaryButtonText}>Подогнать</Text></Pressable>
            <Pressable style={[styles.secondaryButton, !dirty && styles.buttonDisabled]} disabled={!dirty} onPress={() => layout && applyServerSnapshot(layout, { fit: true })}><Text style={styles.secondaryButtonText}>Сбросить</Text></Pressable>
            <Pressable style={[styles.primaryButton, (!dirty || saving) && styles.buttonDisabled]} disabled={!dirty || saving} onPress={() => void saveLayoutDraft()}><Text style={styles.primaryButtonText}>{saving ? "..." : "Сохранить"}</Text></Pressable>
          </View>
        </View>

        {!connected ? <View style={styles.warningBanner}><Text style={styles.warningBannerText}>Нет связи.</Text></View> : null}
        {externalChanged ? (
          <View style={styles.infoBanner}>
            <View style={styles.infoBannerCopy}>
              <Text style={styles.infoBannerTitle}>План изменился на другом устройстве</Text>
              <Text style={styles.infoBannerText}>Можно обновить данные или продолжить со своими правками.</Text>
            </View>
            <View style={styles.infoBannerActions}>
              <Pressable style={styles.secondaryButton} onPress={() => layout && applyServerSnapshot(layout, { fit: true })}><Text style={styles.secondaryButtonText}>Обновить</Text></Pressable>
              <Pressable style={styles.secondaryButton} onPress={() => setExternalChanged(false)}><Text style={styles.secondaryButtonText}>Оставить мои правки</Text></Pressable>
            </View>
          </View>
        ) : null}
        {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}

        <View style={[styles.body, isTablet && styles.bodyTablet]}>
          <View style={styles.canvasColumn}>
            <View style={styles.canvasCard}>
              <Text style={styles.sectionTitle}>Схема</Text>
              <GestureDetector gesture={gesture}>
                <View style={styles.canvasViewport} onLayout={handleCanvasLayout}>
                  <Animated.View style={[styles.canvasContent, animatedCanvasStyle]}>
                    <View style={styles.canvasGrid}>
                      {Array.from({ length: 9 }, (_, index) => <View key={`v-${index}`} style={[styles.gridLineVertical, { left: `${(index + 1) * 10}%` }]} />)}
                      {Array.from({ length: 9 }, (_, index) => <View key={`h-${index}`} style={[styles.gridLineHorizontal, { top: `${(index + 1) * 10}%` }]} />)}
                    </View>
                    {draftZones.map((zone) => <ZoneNodeView key={zone.id} zone={zone} selected={selected?.type === "zone" && selected.id === zone.id} canvasSize={canvasSize} scaleValue={scale} onSelect={(zoneId) => setSelected({ type: "zone", id: zoneId })} onMove={moveZone} onResize={(_zoneId, next) => moveZone(zone.id, next)} />)}
                    {draftTables.map((table) => <TableNodeView key={table.tableId} table={table} selected={selected?.type === "table" && selected.id === table.tableId} canvasSize={canvasSize} scaleValue={scale} onSelect={(tableId) => setSelected({ type: "table", id: tableId })} onMove={moveTable} />)}
                  </Animated.View>
                </View>
              </GestureDetector>
            </View>

            <View style={styles.archiveCard}>
              <View style={styles.archiveHeader}>
                <Text style={styles.sectionTitle}>Архив</Text>
                <Text style={styles.archiveMeta}>{archiveItems.length > 0 ? `${archiveItems.length}` : "Пусто"}</Text>
              </View>
              {archiveItems.length > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.archiveList}>
                  {archiveItems.map((table) => (
                    <View key={`${table.state}-${table.tableId}`} style={styles.archiveItem}>
                      <Text style={styles.archiveTitle}>{table.label || `Стол ${table.tableId}`}</Text>
                      <Text style={styles.archiveText}>{table.state === "pending_archive" ? "Будет убран" : "В архиве"}</Text>
                      <Pressable style={styles.secondaryButton} onPress={() => restoreArchivedTable(table.tableId)}>
                        <Text style={styles.secondaryButtonText}>{table.state === "pending_archive" ? "Вернуть" : "Восстановить"}</Text>
                      </Pressable>
                    </View>
                  ))}
                </ScrollView>
              ) : <Text style={styles.helperText}>Архивных столов нет.</Text>}
            </View>
          </View>

          {isTablet ? <View style={styles.inspectorPane}>{inspector}</View> : null}
        </View>

        {!isTablet && (selectedTable || selectedZone) ? <View style={[styles.bottomSheet, { paddingBottom: insets.bottom + 10 }]}>{inspector}</View> : null}
      </View>
    </SafeAreaView>
  );
}
