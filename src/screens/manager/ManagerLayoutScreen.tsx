import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NavigationProp } from "@react-navigation/native";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
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
  archiveManagerTable,
  createManagerTable,
  fetchManagerLayout,
  restoreManagerTable,
  updateManagerLayout,
} from "../../api/client";
import type { ManagerStackParamList } from "../../navigation/types";
import { useStaffRealtime } from "../../realtime/useStaffRealtime";
import { colors } from "../../theme/colors";
import type {
  FloorTableNode,
  FloorTableShape,
  FloorTableSizePreset,
  FloorZone,
  ManagerLayoutSnapshot,
} from "../../types/domain";

const TABLET_BREAKPOINT = 980;

type ZoneEditor = {
  id?: string;
  label: string;
};

type TableEditor = {
  tableId?: number;
  label: string;
  zoneId: string;
  shape: FloorTableShape;
  sizePreset: FloorTableSizePreset;
};

const SHAPE_OPTIONS: Array<{ value: FloorTableShape; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { value: "round", label: "Круг", icon: "ellipse-outline" },
  { value: "square", label: "Квадрат", icon: "square-outline" },
  { value: "rect", label: "Прямоугольник", icon: "tablet-landscape-outline" },
];

const SIZE_OPTIONS: Array<{ value: FloorTableSizePreset; label: string }> = [
  { value: "sm", label: "Маленький" },
  { value: "md", label: "Средний" },
  { value: "lg", label: "Большой" },
];

function emptyZoneEditor(): ZoneEditor {
  return { label: "" };
}

function emptyTableEditor(zoneId: string): TableEditor {
  return {
    label: "",
    zoneId,
    shape: "square",
    sizePreset: "md",
  };
}

function toZoneEditor(zone: FloorZone): ZoneEditor {
  return {
    id: zone.id,
    label: zone.label,
  };
}

function toTableEditor(table: FloorTableNode, zoneId: string): TableEditor {
  return {
    tableId: table.tableId,
    label: table.label || "",
    zoneId: table.zoneId || zoneId,
    shape: table.shape,
    sizePreset: table.sizePreset,
  };
}

function shapeLabel(shape: FloorTableShape) {
  return SHAPE_OPTIONS.find((item) => item.value === shape)?.label ?? "Стол";
}

function sizeLabel(sizePreset: FloorTableSizePreset) {
  return SIZE_OPTIONS.find((item) => item.value === sizePreset)?.label ?? "Средний";
}

function buildZoneFrame(index: number) {
  const column = index % 2;
  const row = Math.floor(index / 2);
  return {
    x: 8 + column * 42,
    y: 8 + row * 28,
    width: 32,
    height: 22,
  };
}

function normalizeLayout(snapshot: ManagerLayoutSnapshot): ManagerLayoutSnapshot {
  const zones = [...snapshot.zones];
  const fallbackZoneId = zones[0]?.id;
  const normalizeTable = (table: FloorTableNode): FloorTableNode => ({
    ...table,
    zoneId:
      table.zoneId && zones.some((zone) => zone.id === table.zoneId)
        ? table.zoneId
        : fallbackZoneId,
  });

  return {
    zones,
    activeTables: [...snapshot.activeTables].map(normalizeTable).sort((a, b) => a.tableId - b.tableId),
    archivedTables: [...snapshot.archivedTables].map(normalizeTable).sort((a, b) => a.tableId - b.tableId),
  };
}

function ChoiceChipRow<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string; icon?: keyof typeof Ionicons.glyphMap }>;
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            style={[styles.choiceChip, active ? styles.choiceChipActive : null]}
            onPress={() => onChange(option.value)}
          >
            {option.icon ? (
              <Ionicons
                name={option.icon}
                size={16}
                color={active ? colors.white : colors.navy}
              />
            ) : null}
            <Text style={[styles.choiceChipText, active ? styles.choiceChipTextActive : null]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function Banner({ tone, text }: { tone: "warning" | "error"; text: string }) {
  return (
    <View style={[styles.banner, tone === "error" ? styles.bannerError : styles.bannerWarning]}>
      <Text style={[styles.bannerText, tone === "error" ? styles.bannerErrorText : styles.bannerWarningText]}>
        {text}
      </Text>
    </View>
  );
}

export function ManagerLayoutScreen() {
  const navigation = useNavigation<NavigationProp<ManagerStackParamList>>();
  const { width } = useWindowDimensions();
  const isTablet = width >= TABLET_BREAKPOINT;

  const [layout, setLayout] = useState<ManagerLayoutSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [zoneModalOpen, setZoneModalOpen] = useState(false);
  const [tableModalOpen, setTableModalOpen] = useState(false);
  const [zoneEditor, setZoneEditor] = useState<ZoneEditor>(emptyZoneEditor());
  const [tableEditor, setTableEditor] = useState<TableEditor>(emptyTableEditor(""));
  const [savingZone, setSavingZone] = useState(false);
  const [savingTable, setSavingTable] = useState(false);
  const [busyTableId, setBusyTableId] = useState<number | null>(null);

  const applyLayout = useCallback((snapshot: ManagerLayoutSnapshot) => {
    setLayout(normalizeLayout(snapshot));
  }, []);

  const pull = useCallback(async () => {
    const next = await fetchManagerLayout();
    applyLayout(next);
  }, [applyLayout]);

  useEffect(() => {
    setLoading(true);
    void (async () => {
      try {
        await pull();
        setErrorText("");
      } catch {
        setErrorText("Не удалось открыть план.");
      } finally {
        setLoading(false);
      }
    })();
  }, [pull]);

  useEffect(() => {
    if (!layout) return;
    if (selectedZoneId && layout.zones.some((zone) => zone.id === selectedZoneId)) return;
    setSelectedZoneId(layout.zones[0]?.id ?? null);
  }, [layout, selectedZoneId]);

  const { connected, connecting } = useStaffRealtime(
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

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await pull();
      setErrorText("");
    } catch {
      setErrorText("Не удалось обновить план.");
    } finally {
      setRefreshing(false);
    }
  }, [pull]);

  const zoneCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const table of layout?.activeTables ?? []) {
      if (!table.zoneId) continue;
      counts.set(table.zoneId, (counts.get(table.zoneId) ?? 0) + 1);
    }
    return counts;
  }, [layout?.activeTables]);

  const selectedZone = useMemo(
    () => layout?.zones.find((zone) => zone.id === selectedZoneId) ?? null,
    [layout?.zones, selectedZoneId],
  );

  const zoneTables = useMemo(
    () => (layout?.activeTables ?? []).filter((table) => table.zoneId === selectedZoneId),
    [layout?.activeTables, selectedZoneId],
  );

  const archivedZoneTables = useMemo(
    () => (layout?.archivedTables ?? []).filter((table) => table.zoneId === selectedZoneId),
    [layout?.archivedTables, selectedZoneId],
  );

  const saveLayoutSnapshot = useCallback(
    async (nextTables: FloorTableNode[], nextZones: FloorZone[]) => {
      const next = await updateManagerLayout({
        tables: nextTables.map((table) => ({
          tableId: table.tableId,
          label: table.label,
          zoneId: table.zoneId,
          x: table.x,
          y: table.y,
          shape: table.shape,
          sizePreset: table.sizePreset,
        })),
        zones: nextZones,
      });
      applyLayout(next);
      return normalizeLayout(next);
    },
    [applyLayout],
  );

  const openCreateZone = useCallback(() => {
    setZoneEditor(emptyZoneEditor());
    setZoneModalOpen(true);
  }, []);

  const openEditZone = useCallback((zone: FloorZone) => {
    setZoneEditor(toZoneEditor(zone));
    setZoneModalOpen(true);
  }, []);

  const openCreateTable = useCallback(() => {
    if (!selectedZoneId) {
      setErrorText("Сначала добавь зону.");
      return;
    }
    setTableEditor(emptyTableEditor(selectedZoneId));
    setTableModalOpen(true);
  }, [selectedZoneId]);

  const openEditTable = useCallback(
    (table: FloorTableNode) => {
      setTableEditor(toTableEditor(table, selectedZoneId ?? table.zoneId ?? ""));
      setTableModalOpen(true);
    },
    [selectedZoneId],
  );

  const saveZone = useCallback(async () => {
    if (!layout) return;
    const label = zoneEditor.label.trim();
    if (!label) {
      setErrorText("Укажи название зоны.");
      return;
    }

    setSavingZone(true);
    try {
      const zoneId = zoneEditor.id ?? `zone-${Date.now()}`;
      const frame = buildZoneFrame(layout.zones.length);
      const nextZones = zoneEditor.id
        ? layout.zones.map((zone) => (zone.id === zoneEditor.id ? { ...zone, label } : zone))
        : [...layout.zones, { id: zoneId, label, ...frame }];

      await saveLayoutSnapshot(layout.activeTables, nextZones);
      setSelectedZoneId(zoneId);
      setZoneModalOpen(false);
      setErrorText("");
    } catch {
      setErrorText("Не удалось сохранить зону.");
    } finally {
      setSavingZone(false);
    }
  }, [layout, saveLayoutSnapshot, zoneEditor]);

  const confirmDeleteZone = useCallback(
    (zone: FloorZone) => {
      if (!layout) return;
      const hasTables = [...layout.activeTables, ...layout.archivedTables].some((table) => table.zoneId === zone.id);
      if (hasTables) {
        setErrorText("Сначала убери или перенеси столы из этой зоны.");
        return;
      }

      Alert.alert("Удалить зону?", zone.label, [
        { text: "Отмена", style: "cancel" },
        {
          text: "Удалить",
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                const nextZones = layout.zones.filter((item) => item.id !== zone.id);
                const next = await saveLayoutSnapshot(layout.activeTables, nextZones);
                setSelectedZoneId(next.zones[0]?.id ?? null);
                setErrorText("");
              } catch {
                setErrorText("Не удалось удалить зону.");
              }
            })();
          },
        },
      ]);
    },
    [layout, saveLayoutSnapshot],
  );

  const saveTable = useCallback(async () => {
    if (!layout) return;
    const label = tableEditor.label.trim();
    if (!tableEditor.zoneId) {
      setErrorText("Выбери зону.");
      return;
    }

    setSavingTable(true);
    try {
      if (tableEditor.tableId) {
        const nextTables = layout.activeTables.map((table) =>
          table.tableId === tableEditor.tableId
            ? {
                ...table,
                label: label || table.label || `Стол ${table.tableId}`,
                zoneId: tableEditor.zoneId,
                shape: tableEditor.shape,
                sizePreset: tableEditor.sizePreset,
              }
            : table,
        );
        await saveLayoutSnapshot(nextTables, layout.zones);
      } else {
        const next = await createManagerTable({
          label,
          zoneId: tableEditor.zoneId,
          shape: tableEditor.shape,
          sizePreset: tableEditor.sizePreset,
        });
        applyLayout(next);
      }

      setSelectedZoneId(tableEditor.zoneId);
      setTableModalOpen(false);
      setErrorText("");
    } catch {
      setErrorText("Не удалось сохранить стол.");
    } finally {
      setSavingTable(false);
    }
  }, [applyLayout, layout, saveLayoutSnapshot, tableEditor]);

  const archiveTable = useCallback(async (tableId: number) => {
    setBusyTableId(tableId);
    try {
      const next = await archiveManagerTable(tableId);
      applyLayout(next);
      setErrorText("");
    } catch {
      setErrorText("Не удалось убрать стол.");
    } finally {
      setBusyTableId(null);
    }
  }, [applyLayout]);

  const restoreTable = useCallback(async (tableId: number) => {
    setBusyTableId(tableId);
    try {
      const next = await restoreManagerTable(tableId);
      applyLayout(next);
      setErrorText("");
    } catch {
      setErrorText("Не удалось вернуть стол.");
    } finally {
      setBusyTableId(null);
    }
  }, [applyLayout]);

  const openManagerTableCard = useCallback(
    (tableId: number) => {
      navigation.navigate("ManagerTable", { tableId });
    },
    [navigation],
  );

  const zonesScreen = (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>План</Text>
          <Text style={styles.subtitle}>Зоны</Text>
        </View>
        <Pressable style={styles.primaryButton} onPress={openCreateZone}>
          <Ionicons name="add" size={18} color={colors.white} />
          <Text style={styles.primaryButtonText}>Зона</Text>
        </Pressable>
      </View>

      {!loading && !connected && !connecting ? (
        <Banner tone="warning" text="Нет live-обновлений. Можно обновить экран вручную." />
      ) : null}
      {errorText ? <Banner tone="error" text={errorText} /> : null}

      {!loading && (layout?.zones.length ?? 0) === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <Ionicons name="map-outline" size={26} color={colors.navy} />
          </View>
          <Text style={styles.emptyTitle}>Пока нет зон</Text>
          <Pressable style={styles.primaryButton} onPress={openCreateZone}>
            <Ionicons name="add" size={18} color={colors.white} />
            <Text style={styles.primaryButtonText}>Добавить зону</Text>
          </Pressable>
        </View>
      ) : null}

      {(layout?.zones ?? []).map((zone) => {
        const active = selectedZoneId === zone.id;
        const count = zoneCounts.get(zone.id) ?? 0;
        return (
          <Pressable
            key={zone.id}
            style={[styles.zoneCard, active && isTablet ? styles.zoneCardActive : null]}
            onPress={() => setSelectedZoneId(zone.id)}
          >
            <View style={styles.zoneBadge}>
              <Ionicons name="layers-outline" size={22} color={colors.navy} />
            </View>
            <View style={styles.zoneCopy}>
              <Text style={styles.zoneTitle} numberOfLines={2}>
                {zone.label}
              </Text>
              <Text style={styles.zoneMeta}>{count === 0 ? "Пока пусто" : `${count} столов`}</Text>
            </View>
            <View style={styles.cardActions}>
              <Pressable style={styles.iconButton} onPress={() => openEditZone(zone)}>
                <Ionicons name="create-outline" size={18} color={colors.navyDeep} />
              </Pressable>
              <Pressable style={styles.iconButton} onPress={() => setSelectedZoneId(zone.id)}>
                <Ionicons name="chevron-forward-outline" size={18} color={colors.navyDeep} />
              </Pressable>
              <Pressable style={[styles.iconButton, styles.iconButtonDanger]} onPress={() => confirmDeleteZone(zone)}>
                <Ionicons name="trash-outline" size={18} color="#B42318" />
              </Pressable>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );

  const zoneDetail = selectedZone ? (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <View style={styles.headerMain}>
          {!isTablet ? (
            <Pressable style={styles.secondaryButton} onPress={() => setSelectedZoneId(null)}>
              <Ionicons name="chevron-back" size={18} color={colors.navyDeep} />
            </Pressable>
          ) : null}
          <View>
            <Text style={styles.title}>{selectedZone.label}</Text>
            <Text style={styles.subtitle}>{zoneTables.length} столов</Text>
          </View>
        </View>
        <View style={styles.headerActions}>
          <Pressable style={styles.secondaryButton} onPress={() => openEditZone(selectedZone)}>
            <Ionicons name="create-outline" size={18} color={colors.navyDeep} />
          </Pressable>
          <Pressable style={styles.primaryButton} onPress={openCreateTable}>
            <Ionicons name="add" size={18} color={colors.white} />
            <Text style={styles.primaryButtonText}>Стол</Text>
          </Pressable>
        </View>
      </View>

      {errorText ? <Banner tone="error" text={errorText} /> : null}

      {zoneTables.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <Ionicons name="restaurant-outline" size={26} color={colors.navy} />
          </View>
          <Text style={styles.emptyTitle}>В этой зоне пока нет столов</Text>
          <Pressable style={styles.primaryButton} onPress={openCreateTable}>
            <Ionicons name="add" size={18} color={colors.white} />
            <Text style={styles.primaryButtonText}>Добавить стол</Text>
          </Pressable>
        </View>
      ) : null}

      {zoneTables.map((table) => (
        <View key={table.tableId} style={styles.tableCard}>
          <View style={styles.tableCardTop}>
            <View style={styles.tableIcon}>
              <Ionicons
                name={SHAPE_OPTIONS.find((item) => item.value === table.shape)?.icon ?? "square-outline"}
                size={22}
                color={colors.navy}
              />
            </View>
            <View style={styles.tableCopy}>
              <Text style={styles.tableTitle} numberOfLines={1}>
                {table.label || `Стол ${table.tableId}`}
              </Text>
              <Text style={styles.tableMeta}>
                {shapeLabel(table.shape)} · {sizeLabel(table.sizePreset)}
              </Text>
            </View>
            <Pressable style={styles.iconButton} onPress={() => openManagerTableCard(table.tableId)}>
              <Ionicons name="open-outline" size={18} color={colors.navyDeep} />
            </Pressable>
          </View>

          <View style={styles.tableTags}>
            <View style={styles.softPill}>
              <Text style={styles.softPillText}>#{table.tableId}</Text>
            </View>
            <View style={styles.softPill}>
              <Text style={styles.softPillText}>Ссылка в карточке</Text>
            </View>
          </View>

          <View style={styles.tableActions}>
            <Pressable style={styles.secondaryWideButton} onPress={() => openEditTable(table)}>
              <Ionicons name="create-outline" size={18} color={colors.navy} />
              <Text style={styles.secondaryWideButtonText}>Изменить</Text>
            </Pressable>
            <Pressable
              style={[styles.dangerWideButton, busyTableId === table.tableId ? styles.buttonDisabled : null]}
              onPress={() => void archiveTable(table.tableId)}
              disabled={busyTableId === table.tableId}
            >
              <Ionicons name="archive-outline" size={18} color="#B42318" />
              <Text style={styles.dangerWideButtonText}>Убрать</Text>
            </Pressable>
          </View>
        </View>
      ))}

      <View style={styles.archiveBlock}>
        <View style={styles.archiveHeader}>
          <Text style={styles.sectionTitle}>Архив</Text>
          <Text style={styles.archiveCount}>{archivedZoneTables.length}</Text>
        </View>

        {archivedZoneTables.length === 0 ? (
          <Text style={styles.helperText}>Архивных столов в этой зоне нет.</Text>
        ) : (
          archivedZoneTables.map((table) => (
            <View key={table.tableId} style={styles.archiveItem}>
              <View style={styles.archiveCopy}>
                <Text style={styles.archiveTitle}>{table.label || `Стол ${table.tableId}`}</Text>
                <Text style={styles.archiveMeta}>
                  {shapeLabel(table.shape)} · {sizeLabel(table.sizePreset)}
                </Text>
              </View>
              <Pressable
                style={[styles.secondaryButton, busyTableId === table.tableId ? styles.buttonDisabled : null]}
                onPress={() => void restoreTable(table.tableId)}
                disabled={busyTableId === table.tableId}
              >
                <Ionicons name="refresh-outline" size={18} color={colors.navyDeep} />
              </Pressable>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  ) : (
    <View style={styles.emptyStateLarge}>
      <View style={styles.emptyIcon}>
        <Ionicons name="map-outline" size={26} color={colors.navy} />
      </View>
      <Text style={styles.emptyTitle}>Выбери зону</Text>
    </View>
  );

  const zoneModal = (
    <Modal visible={zoneModalOpen} transparent animationType="fade" onRequestClose={() => !savingZone && setZoneModalOpen(false)}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>{zoneEditor.id ? "Изменить зону" : "Новая зона"}</Text>
          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>Название зоны</Text>
            <TextInput
              value={zoneEditor.label}
              onChangeText={(label) => setZoneEditor((current) => ({ ...current, label }))}
              placeholder="Например, Терраса"
              placeholderTextColor="#8A847A"
              style={styles.input}
            />
          </View>
          <View style={styles.modalActions}>
            <Pressable style={styles.secondaryWideButton} onPress={() => setZoneModalOpen(false)} disabled={savingZone}>
              <Text style={styles.secondaryWideButtonText}>Отмена</Text>
            </Pressable>
            <Pressable
              style={[styles.primaryWideButton, savingZone ? styles.buttonDisabled : null]}
              onPress={() => void saveZone()}
              disabled={savingZone}
            >
              <Text style={styles.primaryButtonText}>{savingZone ? "..." : "Сохранить"}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );

  const tableModal = (
    <Modal visible={tableModalOpen} animationType="slide" onRequestClose={() => !savingTable && setTableModalOpen(false)}>
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        <KeyboardAvoidingView style={styles.modalScreen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView contentContainerStyle={styles.modalScreenContent} keyboardShouldPersistTaps="handled">
            <View style={styles.sheetHeader}>
              <Text style={styles.modalTitle}>{tableEditor.tableId ? "Изменить стол" : "Новый стол"}</Text>
              <Pressable style={styles.secondaryButton} onPress={() => setTableModalOpen(false)} disabled={savingTable}>
                <Ionicons name="close" size={18} color={colors.navyDeep} />
              </Pressable>
            </View>

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Название стола</Text>
              <TextInput
                value={tableEditor.label}
                onChangeText={(label) => setTableEditor((current) => ({ ...current, label }))}
                placeholder={tableEditor.tableId ? `Стол ${tableEditor.tableId}` : "Например, Стол у окна"}
                placeholderTextColor="#8A847A"
                style={styles.input}
              />
            </View>

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Зона</Text>
              <ChoiceChipRow
                options={(layout?.zones ?? []).map((zone) => ({ value: zone.id, label: zone.label }))}
                value={tableEditor.zoneId}
                onChange={(zoneId) => setTableEditor((current) => ({ ...current, zoneId }))}
              />
            </View>

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Форма</Text>
              <ChoiceChipRow
                options={SHAPE_OPTIONS}
                value={tableEditor.shape}
                onChange={(shape) => setTableEditor((current) => ({ ...current, shape }))}
              />
            </View>

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Размер</Text>
              <ChoiceChipRow
                options={SIZE_OPTIONS}
                value={tableEditor.sizePreset}
                onChange={(sizePreset) => setTableEditor((current) => ({ ...current, sizePreset }))}
              />
            </View>

            <View style={styles.modalActions}>
              <Pressable style={styles.secondaryWideButton} onPress={() => setTableModalOpen(false)} disabled={savingTable}>
                <Text style={styles.secondaryWideButtonText}>Отмена</Text>
              </Pressable>
              <Pressable
                style={[styles.primaryWideButton, savingTable ? styles.buttonDisabled : null]}
                onPress={() => void saveTable()}
                disabled={savingTable}
              >
                <Text style={styles.primaryButtonText}>{savingTable ? "..." : "Сохранить"}</Text>
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );

  if (loading && !layout) {
    return (
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        <View style={styles.centerState}>
          <Text style={styles.helperText}>Загрузка...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <View style={styles.screen}>
        {isTablet ? (
          <View style={styles.tabletShell}>
            <View style={styles.sidebar}>{zonesScreen}</View>
            <View style={styles.mainPane}>{zoneDetail}</View>
          </View>
        ) : selectedZoneId ? (
          zoneDetail
        ) : (
          zonesScreen
        )}

        {zoneModal}
        {tableModal}
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
  sidebar: {
    width: 360,
    backgroundColor: colors.white,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "#DED7CA",
    overflow: "hidden",
  },
  mainPane: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "#DED7CA",
    overflow: "hidden",
  },
  scrollContent: {
    padding: 16,
    gap: 14,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  headerMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    color: colors.navyDeep,
    fontSize: 30,
    fontWeight: "800",
  },
  subtitle: {
    color: colors.muted,
    fontSize: 14,
    marginTop: 4,
  },
  primaryButton: {
    minHeight: 46,
    borderRadius: 16,
    backgroundColor: colors.navy,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  primaryButtonText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: "800",
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
    flex: 1,
  },
  dangerWideButtonText: {
    color: "#B42318",
    fontWeight: "700",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  banner: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  bannerWarning: {
    backgroundColor: "#F6E8D0",
  },
  bannerError: {
    backgroundColor: "#FDECEA",
  },
  bannerText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
  bannerWarningText: {
    color: "#8A6123",
  },
  bannerErrorText: {
    color: "#B42318",
  },
  zoneCard: {
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
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  zoneCardActive: {
    borderColor: "#B8CAE9",
    backgroundColor: "#FBFCFF",
  },
  zoneBadge: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: "#EEF3FF",
    alignItems: "center",
    justifyContent: "center",
  },
  zoneCopy: {
    flex: 1,
    gap: 6,
    minWidth: 0,
  },
  zoneTitle: {
    color: colors.navyDeep,
    fontSize: 21,
    fontWeight: "800",
    lineHeight: 26,
  },
  zoneMeta: {
    color: colors.muted,
    fontSize: 14,
  },
  cardActions: {
    gap: 8,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  iconButtonDanger: {
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
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 24,
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
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center",
  },
  tableCard: {
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
  tableCardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  tableIcon: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: "#EEF3FF",
    alignItems: "center",
    justifyContent: "center",
  },
  tableCopy: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  tableTitle: {
    color: colors.navyDeep,
    fontSize: 22,
    fontWeight: "800",
  },
  tableMeta: {
    color: colors.muted,
    fontSize: 14,
  },
  tableTags: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
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
  tableActions: {
    flexDirection: "row",
    gap: 10,
  },
  archiveBlock: {
    marginTop: 8,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: "#FFFDF8",
    padding: 14,
    gap: 12,
  },
  archiveHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    color: colors.navyDeep,
    fontSize: 18,
    fontWeight: "800",
  },
  archiveCount: {
    minWidth: 30,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#EEF3FF",
    color: colors.navy,
    fontWeight: "800",
    textAlign: "center",
  },
  archiveItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    padding: 12,
  },
  archiveCopy: {
    flex: 1,
    gap: 4,
  },
  archiveTitle: {
    color: colors.navyDeep,
    fontSize: 16,
    fontWeight: "700",
  },
  archiveMeta: {
    color: colors.muted,
    fontSize: 13,
  },
  helperText: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(10, 20, 40, 0.28)",
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    borderRadius: 28,
    backgroundColor: colors.cream,
    padding: 16,
    gap: 14,
  },
  modalScreen: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  modalScreenContent: {
    padding: 16,
    gap: 14,
  },
  modalTitle: {
    color: colors.navyDeep,
    fontSize: 24,
    fontWeight: "800",
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
  chipsRow: {
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
    flexDirection: "row",
    gap: 8,
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
  modalActions: {
    flexDirection: "row",
    gap: 10,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
});
