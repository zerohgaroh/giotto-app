import { useNavigation } from "@react-navigation/native";
import type { NavigationProp } from "@react-navigation/native";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { fetchManagerHall } from "../../api/client";
import { StatusBadge } from "../../components/StatusBadge";
import type { ManagerStackParamList } from "../../navigation/types";
import { useStaffRealtime } from "../../realtime/useStaffRealtime";
import { colors } from "../../theme/colors";
import { formatDurationFrom } from "../../theme/format";
import type { ManagerHallResponse, ServiceTableStatus } from "../../types/domain";
import { ManagerTablePanel } from "./ManagerTablePanel";

const FILTERS: Array<{ id: "all" | ServiceTableStatus; label: string }> = [
  { id: "all", label: "Все" },
  { id: "waiting", label: "Ждут" },
  { id: "bill", label: "Счет" },
  { id: "ordered", label: "Заказ" },
  { id: "occupied", label: "Заняты" },
  { id: "free", label: "Свободны" },
];

export function ManagerHallScreen() {
  const navigation = useNavigation<NavigationProp<ManagerStackParamList>>();
  const { width } = useWindowDimensions();
  const isTablet = width >= 900;

  const [data, setData] = useState<ManagerHallResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [filter, setFilter] = useState<"all" | ServiceTableStatus>("all");
  const [selectedTableId, setSelectedTableId] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());

  const pull = useCallback(async (withLoader = false) => {
    if (withLoader) setLoading(true);
    try {
      const next = await fetchManagerHall();
      setData(next);
      setSelectedTableId((current) => current ?? next.tables[0]?.tableId ?? null);
      setErrorText("");
    } catch {
      setErrorText("Не удалось загрузить зал.");
    } finally {
      if (withLoader) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void pull(true);
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [pull]);

  const { connected, connecting } = useStaffRealtime(
    useCallback(() => {
      void pull(false);
    }, [pull]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await pull(false);
    setRefreshing(false);
  }, [pull]);

  const filteredTables = useMemo(() => {
    const tables = data?.tables ?? [];
    return tables.filter((table) => filter === "all" || table.status === filter);
  }, [data?.tables, filter]);

  const kpis = useMemo(() => {
    const tables = data?.tables ?? [];
    return {
      activeCalls: tables.filter((table) => table.activeRequestsCount > 0).length,
      occupied: tables.filter((table) => table.status !== "free").length,
      total: tables.length,
    };
  }, [data?.tables]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.safeArea, styles.center]}>
        <ActivityIndicator color={colors.navy} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.title}>Зал</Text>
      </View>

      <View style={styles.kpiRow}>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>Вызовы</Text>
          <Text style={styles.kpiValue}>{kpis.activeCalls}</Text>
        </View>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>Заняты</Text>
          <Text style={styles.kpiValue}>
            {kpis.occupied}/{kpis.total}
          </Text>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        {FILTERS.map((item) => (
          <Pressable
            key={item.id}
            style={[styles.filterChip, filter === item.id ? styles.filterChipActive : null]}
            onPress={() => setFilter(item.id)}
          >
            <Text style={[styles.filterChipText, filter === item.id ? styles.filterChipTextActive : null]}>
              {item.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {!connected && !connecting ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>Нет live-обновлений. Потяни экран вниз, чтобы обновить данные.</Text>
        </View>
      ) : null}

      {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}

      {isTablet ? (
        <View style={styles.tabletLayout}>
          <FlatList
            data={filteredTables}
            keyExtractor={(item) => String(item.tableId)}
            contentContainerStyle={styles.listContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            renderItem={({ item }) => {
              const waiter = data?.waiters.find((candidate) => candidate.id === item.assignedWaiterId);
              const selected = selectedTableId === item.tableId;
              return (
                <Pressable
                  style={[
                    styles.card,
                    selected ? styles.cardSelected : null,
                    item.activeRequestsCount > 0 ? styles.cardAlert : null,
                  ]}
                  onPress={() => setSelectedTableId(item.tableId)}
                >
                  <View style={styles.cardHead}>
                    <Text style={styles.cardTitle}>Стол {item.tableId}</Text>
                    <StatusBadge status={item.status} />
                  </View>
                  <Text style={styles.cardMeta}>{waiter?.name || "Не назначен"}</Text>
                  <Text style={styles.cardMeta}>За столом {formatDurationFrom(item.guestStartedAt, now)}</Text>
                  <Text style={styles.cardMeta}>
                    {item.activeRequestsCount > 0 ? `Запросов: ${item.activeRequestsCount}` : "Без запросов"}
                  </Text>
                </Pressable>
              );
            }}
          />

          <View style={styles.detailPane}>
            {selectedTableId ? (
              <ManagerTablePanel tableId={selectedTableId} onMutated={() => void pull(false)} />
            ) : (
              <Text style={styles.emptyText}>Выберите стол</Text>
            )}
          </View>
        </View>
      ) : (
        <FlatList
          data={filteredTables}
          keyExtractor={(item) => String(item.tableId)}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          renderItem={({ item }) => {
            const waiter = data?.waiters.find((candidate) => candidate.id === item.assignedWaiterId);
            return (
              <Pressable
                style={[styles.card, item.activeRequestsCount > 0 ? styles.cardAlert : null]}
                onPress={() => navigation.navigate("ManagerTable", { tableId: item.tableId })}
              >
                <View style={styles.cardHead}>
                  <Text style={styles.cardTitle}>Стол {item.tableId}</Text>
                  <StatusBadge status={item.status} />
                </View>
                <Text style={styles.cardMeta}>{waiter?.name || "Не назначен"}</Text>
                <Text style={styles.cardMeta}>За столом {formatDurationFrom(item.guestStartedAt, now)}</Text>
                <Text style={styles.cardMeta}>
                  {item.activeRequestsCount > 0 ? `Запросов: ${item.activeRequestsCount}` : "Без запросов"}
                </Text>
              </Pressable>
            );
          }}
        />
      )}
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
    paddingTop: 16,
  },
  title: {
    fontSize: 30,
    fontWeight: "800",
    color: colors.navyDeep,
  },
  kpiRow: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    marginTop: 14,
  },
  kpiCard: {
    flex: 1,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#D9D2C6",
    backgroundColor: colors.white,
    padding: 16,
    shadowColor: "#0A1F4A",
    shadowOpacity: 0.05,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  kpiLabel: {
    color: colors.muted,
    fontSize: 13,
  },
  kpiValue: {
    marginTop: 8,
    color: colors.navyDeep,
    fontSize: 26,
    fontWeight: "800",
  },
  filterRow: {
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 4,
    alignItems: "center",
  },
  filterChip: {
    minWidth: 88,
    minHeight: 42,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  filterChipActive: {
    borderColor: colors.navy,
    backgroundColor: colors.navy,
  },
  filterChipText: {
    color: colors.navy,
    fontWeight: "700",
    fontSize: 14,
  },
  filterChipTextActive: {
    color: colors.white,
  },
  banner: {
    marginTop: 10,
    marginHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E8D6B5",
    backgroundColor: "#FFF8EC",
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  bannerText: {
    color: "#8A6A33",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
  },
  errorText: {
    marginTop: 8,
    marginHorizontal: 16,
    color: "#B42318",
  },
  row: {
    gap: 8,
  },
  listContent: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 24,
    gap: 8,
  },
  card: {
    flex: 1,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#D9D2C6",
    backgroundColor: colors.white,
    padding: 14,
    marginBottom: 8,
    minHeight: 144,
    shadowColor: "#0A1F4A",
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  cardSelected: {
    borderColor: colors.navy,
    backgroundColor: "#F9FBFF",
  },
  cardAlert: {
    borderColor: "#D2B177",
    backgroundColor: "#FFFDF8",
  },
  cardHead: {
    gap: 10,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.navyDeep,
  },
  cardMeta: {
    marginTop: 6,
    color: colors.muted,
    fontSize: 14,
    lineHeight: 19,
  },
  tabletLayout: {
    flex: 1,
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 12,
    paddingBottom: 12,
    marginTop: 8,
  },
  detailPane: {
    flex: 1.1,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#D9D2C6",
    backgroundColor: colors.white,
    overflow: "hidden",
  },
  emptyText: {
    color: colors.muted,
    padding: 20,
  },
});
