import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { fetchHallData, resetHallData } from "../../api/client";
import { StatusBadge } from "../../components/StatusBadge";
import { colors } from "../../theme/colors";
import { formatDurationFrom } from "../../theme/format";
import type { HallData } from "../../types/domain";

export function ManagerHallScreen() {
  const [hall, setHall] = useState<HallData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [now, setNow] = useState(Date.now());

  const pull = useCallback(async (withLoader = false) => {
    if (withLoader) setLoading(true);
    try {
      const next = await fetchHallData();
      setHall(next);
      setErrorText("");
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "Не удалось загрузить зал");
    } finally {
      if (withLoader) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void pull(true);
    const poll = setInterval(() => {
      void pull(false);
    }, 3000);
    const timer = setInterval(() => setNow(Date.now()), 1000);

    return () => {
      clearInterval(poll);
      clearInterval(timer);
    };
  }, [pull]);

  const activeCalls = useMemo(
    () => (hall?.requests || []).filter((request) => !request.resolvedAt).length,
    [hall?.requests],
  );

  const onReset = async () => {
    try {
      const next = await resetHallData();
      setHall(next);
      setErrorText("");
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "Не удалось сбросить смену");
    }
  };

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
        <View style={styles.counter}><Text style={styles.counterText}>Вызовы: {activeCalls}</Text></View>
      </View>

      <View style={styles.actionRow}>
        <Text style={styles.subtitle}>Мониторинг столов в реальном времени</Text>
        <Pressable style={styles.resetBtn} onPress={() => void onReset()}>
          <Text style={styles.resetBtnText}>Сброс смены</Text>
        </Pressable>
      </View>

      {errorText ? <Text style={styles.error}>{errorText}</Text> : null}

      <FlatList
        data={[...(hall?.tables || [])].sort((a, b) => a.tableId - b.tableId)}
        keyExtractor={(item) => String(item.tableId)}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => {
          setRefreshing(true);
          await pull(false);
          setRefreshing(false);
        }} />}
        renderItem={({ item }) => {
          const waiter = hall?.waiters.find((w) => w.id === item.assignedWaiterId);
          const request = hall?.requests
            .filter((r) => r.tableId === item.tableId && !r.resolvedAt)
            .sort((a, b) => b.createdAt - a.createdAt)[0];

          return (
            <View style={[styles.card, request && styles.alertCard]}>
              <View style={styles.cardHead}>
                <Text style={styles.cardTitle}>Стол {item.tableId}</Text>
                <StatusBadge status={item.status} />
              </View>
              <Text style={styles.cardMeta}>👤 {waiter?.name || "Без официанта"}</Text>
              <Text style={styles.cardMeta}>⏱ {formatDurationFrom(item.guestStartedAt, now)}</Text>
              {request ? (
                <Text style={styles.request}>🔔 {request.type === "bill" ? "Просит счёт" : "Вызов"}</Text>
              ) : null}
            </View>
          );
        }}
      />
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
    paddingTop: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    fontSize: 30,
    color: colors.navyDeep,
    fontWeight: "700",
  },
  counter: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#E5BDAE",
    backgroundColor: "#FFF1ED",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  counterText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#B42318",
  },
  actionRow: {
    paddingHorizontal: 16,
    marginTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  subtitle: {
    color: colors.muted,
    fontSize: 12,
    flex: 1,
    paddingRight: 10,
  },
  resetBtn: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  resetBtnText: {
    color: colors.navy,
    fontWeight: "600",
    fontSize: 12,
  },
  error: {
    paddingHorizontal: 16,
    marginTop: 8,
    color: "#B42318",
  },
  listContent: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 20,
  },
  row: {
    gap: 8,
  },
  card: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    padding: 10,
    marginBottom: 8,
    minHeight: 130,
  },
  alertCard: {
    borderWidth: 2,
    borderColor: colors.gold,
  },
  cardHead: {
    gap: 8,
  },
  cardTitle: {
    color: colors.navyDeep,
    fontSize: 16,
    fontWeight: "700",
  },
  cardMeta: {
    marginTop: 7,
    color: colors.muted,
    fontSize: 12,
  },
  request: {
    marginTop: 8,
    color: "#8A6A33",
    fontWeight: "700",
    fontSize: 12,
  },
});
