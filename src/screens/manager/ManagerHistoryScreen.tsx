import { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NavigationProp } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import { fetchManagerHistory } from "../../api/client";
import type { ManagerStackParamList } from "../../navigation/types";
import { useStaffRealtime } from "../../realtime/useStaffRealtime";
import { colors } from "../../theme/colors";
import { formatTime } from "../../theme/format";
import type { ManagerHistoryEntry, ManagerHistoryPage } from "../../types/domain";

const FILTERS = [
  { id: "all", label: "Все" },
  { id: "waiter:called", label: "Вызов" },
  { id: "bill:requested", label: "Счёт" },
  { id: "waiter:acknowledged", label: "Принято" },
  { id: "waiter:done", label: "Готово" },
  { id: "table:assignment_changed", label: "Назначение" },
  { id: "table:status_changed", label: "Статус" },
];

function eventLabel(item: ManagerHistoryEntry) {
  switch (item.type) {
    case "waiter:called":
      return "Вызвали официанта";
    case "bill:requested":
      return "Запросили счёт";
    case "waiter:acknowledged":
      return "Запрос принят";
    case "waiter:done":
      return "Обслуживание завершено";
    case "table:assignment_changed":
      return "Сменили официанта";
    case "table:status_changed":
      return "Изменился статус";
    case "task:created":
      return "Создали задачу";
    case "task:updated":
      return "Обновили задачу";
    case "task:completed":
      return "Задача закрыта";
    case "restaurant:updated":
      return "Обновили ресторан";
    case "shift:summary_changed":
      return "Обновили сводку смены";
    default:
      return item.type;
  }
}

export function ManagerHistoryScreen() {
  const navigation = useNavigation<NavigationProp<ManagerStackParamList>>();
  const [data, setData] = useState<ManagerHistoryPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filter, setFilter] = useState("all");
  const [errorText, setErrorText] = useState("");

  const pull = useCallback(async (cursor?: string) => {
    const next = await fetchManagerHistory({
      type: filter === "all" ? undefined : filter,
      cursor,
      limit: 25,
    });
    setData((current) => (cursor && current ? { items: [...current.items, ...next.items], nextCursor: next.nextCursor } : next));
  }, [filter]);

  useEffect(() => {
    setLoading(true);
    void (async () => {
      try {
        await pull();
        setErrorText("");
      } catch {
        setErrorText("Не удалось загрузить историю.");
      } finally {
        setLoading(false);
      }
    })();
  }, [pull]);

  useStaffRealtime(
    useCallback(() => {
      void pull().catch(() => {
        setErrorText("Не удалось обновить историю.");
      });
    }, [pull]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await pull();
      setErrorText("");
    } catch {
      setErrorText("Не удалось обновить историю.");
    } finally {
      setRefreshing(false);
    }
  };

  const onLoadMore = async () => {
    if (!data?.nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      await pull(data.nextCursor);
      setErrorText("");
    } catch {
      setErrorText("Не удалось загрузить ещё.");
    } finally {
      setLoadingMore(false);
    }
  };

  const renderItem = (item: ManagerHistoryEntry) => (
    <Pressable
      key={item.id}
      style={styles.card}
      onPress={() => {
        if (item.tableId) {
          navigation.navigate("ManagerTable", { tableId: item.tableId });
        }
      }}
    >
      <Text style={styles.cardTitle}>{eventLabel(item)}</Text>
      <Text style={styles.cardMeta}>{item.tableId ? `Стол ${item.tableId}` : "Общее"}</Text>
      <Text style={styles.cardMeta}>{formatTime(item.ts)}</Text>
    </Pressable>
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>История</Text>
      </View>

      <View style={styles.filterSection}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
          style={styles.filterScroller}
        >
          {FILTERS.map((item) => (
            <Pressable
              key={item.id}
              style={[styles.filterChip, filter === item.id && styles.filterChipActive]}
              onPress={() => setFilter(item.id)}
            >
              <Text style={[styles.filterText, filter === item.id && styles.filterTextActive]}>{item.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {loading ? <Text style={styles.meta}>Загрузка...</Text> : null}
        {data?.items.map(renderItem)}
        {data?.nextCursor ? (
          <Pressable style={styles.moreButton} onPress={() => void onLoadMore()} disabled={loadingMore}>
            <Text style={styles.moreButtonText}>{loadingMore ? "..." : "Ещё"}</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.cream,
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
  filterRow: {
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
    paddingRight: 24,
    alignItems: "center",
  },
  filterSection: {
    marginBottom: 8,
  },
  filterScroller: {
    flexGrow: 0,
  },
  filterChip: {
    minHeight: 44,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  filterChipActive: {
    borderColor: colors.navy,
    backgroundColor: colors.navy,
  },
  filterText: {
    color: colors.navy,
    fontWeight: "700",
    fontSize: 14,
    lineHeight: 18,
    textAlign: "center",
    includeFontPadding: false,
  },
  filterTextActive: {
    color: colors.white,
  },
  errorText: {
    marginTop: 10,
    marginHorizontal: 16,
    color: "#B42318",
  },
  content: {
    padding: 16,
    paddingTop: 8,
    gap: 12,
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#D9D2C6",
    backgroundColor: colors.white,
    padding: 14,
    gap: 8,
    shadowColor: "#0A1F4A",
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  cardTitle: {
    color: colors.navyDeep,
    fontWeight: "800",
    fontSize: 16,
  },
  cardMeta: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  meta: {
    color: colors.muted,
  },
  moreButton: {
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.navy,
    alignItems: "center",
    justifyContent: "center",
  },
  moreButtonText: {
    color: colors.navy,
    fontWeight: "700",
  },
});
