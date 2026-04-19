import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { fetchWaiterQueue, fetchWaiterShiftSummary } from "../../api/client";
import type { WaiterTabParamList } from "../../navigation/types";
import { useWaiterRealtime } from "../../realtime/useWaiterRealtime";
import { colors } from "../../theme/colors";
import { formatDurationFrom } from "../../theme/format";
import type { WaiterQueueResponse, WaiterShiftSummary } from "../../types/domain";

type Props = BottomTabScreenProps<WaiterTabParamList, "WaiterShift">;

export function WaiterShiftScreen(_props: Props) {
  const [summary, setSummary] = useState<WaiterShiftSummary | null>(null);
  const [queue, setQueue] = useState<WaiterQueueResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [now, setNow] = useState(Date.now());

  const pull = useCallback(async (withLoader = false) => {
    if (withLoader) setLoading(true);
    try {
      const [nextSummary, nextQueue] = await Promise.all([fetchWaiterShiftSummary(), fetchWaiterQueue()]);
      setSummary(nextSummary);
      setQueue(nextQueue);
      setErrorText("");
    } catch {
      setErrorText("Не удалось загрузить аналитику смены.");
    } finally {
      if (withLoader) setLoading(false);
    }
  }, []);

  const handleRealtimeEvent = useCallback(() => {
    void pull(false);
  }, [pull]);

  const { connected } = useWaiterRealtime(handleRealtimeEvent);

  useEffect(() => {
    void pull(true);
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [pull]);

  useFocusEffect(
    useCallback(() => {
      void pull(false);
    }, [pull]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await pull(false);
    setRefreshing(false);
  };

  const chartData = useMemo(() => {
    if (!summary || !queue) return [];
    return [
      { label: "Вызовы", value: queue.tasks.length },
      { label: "Срочные", value: queue.summary.urgentCount },
      { label: "Закрыто задач", value: summary.tasksHandled },
      { label: "Обслужено", value: summary.serviceCompletedCount },
    ];
  }, [queue, summary]);

  const maxChartValue = Math.max(1, ...chartData.map((item) => item.value));

  if (loading && !summary) {
    return (
      <SafeAreaView style={[styles.safeArea, styles.center]} edges={["top"]}>
        <ActivityIndicator color={colors.navy} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.header}>
          <Text style={styles.label}>Официант</Text>
          <Text style={styles.title}>Смена</Text>
          {summary ? <Text style={styles.subtitle}>Идёт {formatDurationFrom(summary.shiftStartedAt, now)}</Text> : null}
        </View>

        {!connected ? <View style={styles.banner}><Text style={styles.bannerText}>Нет связи.</Text></View> : null}

        {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}

        {summary ? (
          <View style={styles.grid}>
            <View style={styles.metricCard}>
              <Text style={styles.metricValue}>{summary.tasksHandled}</Text>
              <Text style={styles.metricLabel}>Закрыто задач</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricValue}>{summary.avgResponseSec}s</Text>
              <Text style={styles.metricLabel}>Средний ответ</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricValue}>{summary.activeTablesCount}</Text>
              <Text style={styles.metricLabel}>Активные столы</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricValue}>{summary.waiterOrdersCount}</Text>
              <Text style={styles.metricLabel}>Добавлено позиций</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricValue}>{summary.serviceCompletedCount}</Text>
              <Text style={styles.metricLabel}>Обслужено</Text>
            </View>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Нагрузка по смене</Text>
          {chartData.map((item) => {
            const percent = Math.round((item.value / maxChartValue) * 100);
            return (
              <View key={item.label} style={styles.chartRow}>
                <View style={styles.chartRowHead}>
                  <Text style={styles.chartLabel}>{item.label}</Text>
                  <Text style={styles.chartValue}>{item.value}</Text>
                </View>
                <View style={styles.chartTrack}>
                  <View style={[styles.chartFill, { width: `${percent}%` }]} />
                </View>
              </View>
            );
          })}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Состояние очереди</Text>
          <View style={styles.queueStatsRow}>
            <View style={styles.queueStatBox}>
              <Text style={styles.queueStatValue}>{queue?.summary.inProgressCount ?? 0}</Text>
              <Text style={styles.queueStatLabel}>В работе</Text>
            </View>
            <View style={styles.queueStatBox}>
              <Text style={styles.queueStatValue}>{queue?.summary.urgentCount ?? 0}</Text>
              <Text style={styles.queueStatLabel}>Срочные</Text>
            </View>
            <View style={styles.queueStatBox}>
              <Text style={styles.queueStatValue}>{queue?.tasks.length ?? 0}</Text>
              <Text style={styles.queueStatLabel}>Всего задач</Text>
            </View>
          </View>
        </View>
      </ScrollView>
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
  content: {
    padding: 16,
    paddingBottom: 30,
    gap: 12,
  },
  header: {
    gap: 4,
  },
  label: {
    textTransform: "uppercase",
    fontSize: 11,
    color: colors.muted,
    letterSpacing: 1,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: colors.navyDeep,
  },
  subtitle: {
    color: colors.navy,
    fontWeight: "600",
  },
  banner: {
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
    color: "#B42318",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  metricCard: {
    width: "48%",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    padding: 12,
  },
  metricValue: {
    color: colors.navyDeep,
    fontSize: 22,
    fontWeight: "700",
  },
  metricLabel: {
    marginTop: 4,
    color: colors.muted,
    fontSize: 12,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    padding: 14,
    gap: 12,
  },
  cardTitle: {
    color: colors.navyDeep,
    fontSize: 18,
    fontWeight: "700",
  },
  chartRow: {
    gap: 6,
  },
  chartRowHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  chartLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "600",
  },
  chartValue: {
    color: colors.navy,
    fontWeight: "700",
    fontSize: 13,
  },
  chartTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: "#ECE8E0",
    overflow: "hidden",
  },
  chartFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: colors.navy,
  },
  queueStatsRow: {
    flexDirection: "row",
    gap: 8,
  },
  queueStatBox: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: "#FFFDF8",
    padding: 10,
    alignItems: "center",
    gap: 4,
  },
  queueStatValue: {
    color: colors.navyDeep,
    fontSize: 20,
    fontWeight: "700",
  },
  queueStatLabel: {
    color: colors.muted,
    fontSize: 11,
    textAlign: "center",
  },
});
