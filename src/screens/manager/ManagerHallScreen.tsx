import { useNavigation } from "@react-navigation/native";
import type { NavigationProp } from "@react-navigation/native";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  SafeAreaView,
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
  { id: "bill", label: "Счёт" },
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
  const [now, setNow] = useState(Date.now());
  const [filter, setFilter] = useState<"all" | ServiceTableStatus>("all");
  const [selectedTableId, setSelectedTableId] = useState<number | null>(null);

  const pull = useCallback(async (withLoader = false) => {
    if (withLoader) setLoading(true);
    try {
      const next = await fetchManagerHall();
      setData(next);
      setErrorText("");
      setSelectedTableId((current) => current ?? next.tables[0]?.tableId ?? null);
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

  const { connected } = useStaffRealtime(
    useCallback(() => {
      void pull(false);
    }, [pull]),
  );

  const filteredTables = useMemo(() => {
    const tables = data?.tables ?? [];
    return tables.filter((table) => filter === "all" || table.status === filter);
  }, [data?.tables, filter]);

  const onRefresh = async () => {
    setRefreshing(true);
    await pull(false);
    setRefreshing(false);
  };

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

      <View style={styles.filterRow}>
        {FILTERS.map((item) => (
          <Pressable
            key={item.id}
            style={[styles.filterChip, filter === item.id && styles.filterChipActive]}
            onPress={() => setFilter(item.id)}
          >
            <Text style={[styles.filterChipText, filter === item.id && styles.filterChipTextActive]}>{item.label}</Text>
          </Pressable>
        ))}
      </View>

      {!connected ? <View style={styles.banner}><Text style={styles.bannerText}>Нет связи.</Text></View> : null}

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
                  style={[styles.card, selected && styles.cardSelected, item.activeRequestsCount > 0 && styles.cardAlert]}
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
                style={[styles.card, item.activeRequestsCount > 0 && styles.cardAlert]}
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
    fontWeight: "700",
    color: colors.navyDeep,
  },
  kpiRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    marginTop: 14,
  },
  kpiCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    padding: 12,
  },
  kpiLabel: {
    color: colors.muted,
    fontSize: 12,
  },
  kpiValue: {
    marginTop: 6,
    color: colors.navyDeep,
    fontSize: 24,
    fontWeight: "700",
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 16,
    marginTop: 12,
  },
  filterChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  filterChipActive: {
    borderColor: colors.navy,
    backgroundColor: colors.navy,
  },
  filterChipText: {
    color: colors.navy,
    fontWeight: "600",
    fontSize: 12,
  },
  filterChipTextActive: {
    color: colors.white,
  },
  banner: {
    marginTop: 10,
    marginHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E8D6B5",
    backgroundColor: "#FFF8EC",
    padding: 10,
  },
  bannerText: {
    color: "#8A6A33",
    fontSize: 12,
    lineHeight: 18,
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
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    padding: 12,
    marginBottom: 8,
    minHeight: 132,
  },
  cardSelected: {
    borderColor: colors.navy,
  },
  cardAlert: {
    borderWidth: 2,
    borderColor: colors.gold,
  },
  cardHead: {
    gap: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.navyDeep,
  },
  cardMeta: {
    marginTop: 8,
    color: colors.muted,
    fontSize: 12,
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
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    overflow: "hidden",
  },
  emptyText: {
    color: colors.muted,
    padding: 20,
  },
});
