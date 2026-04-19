import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ackWaiterTask, completeWaiterTask, fetchWaiterQueue, startWaiterTask } from "../../api/client";
import type { WaiterStackParamList, WaiterTabParamList } from "../../navigation/types";
import { useWaiterRealtime } from "../../realtime/useWaiterRealtime";
import { createMutationKey } from "../../runtime/waiterDrafts";
import { colors } from "../../theme/colors";
import { formatDurationFrom, formatTime } from "../../theme/format";
import type { WaiterQueueResponse, WaiterTask } from "../../types/domain";
import { sortWaiterQueueTasks } from "./attentionSort";

type Props = BottomTabScreenProps<WaiterTabParamList, "WaiterQueue">;

function taskTypeLabel(task: WaiterTask) {
  if (task.type === "bill_request") return "Счёт";
  if (task.type === "follow_up") return "Задача";
  return "Вызов";
}

function taskHumanTitle(task: WaiterTask) {
  if (task.type === "bill_request") return "Гости просят счёт";
  if (task.type === "waiter_call") return "Гости вызывают официанта";
  return "Задача по столу";
}

function taskHumanSubtitle(task: WaiterTask) {
  if (task.type === "bill_request") return "Гости готовы оплатить заказ.";
  if (task.type === "waiter_call") return "Гости ждут официанта.";
  return task.subtitle || "";
}

function taskStatusLabel(task: WaiterTask) {
  if (task.status === "in_progress") return "В работе";
  if (task.status === "acknowledged") return "Принято";
  if (task.status === "completed") return "Готово";
  if (task.status === "cancelled") return "Отменено";
  return "Новое";
}

export function WaiterQueueScreen({ navigation, route }: Props) {
  const [data, setData] = useState<WaiterQueueResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [now, setNow] = useState(Date.now());
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [completeMutationKeys, setCompleteMutationKeys] = useState<Record<string, string>>({});

  const highlightTableId = route.params?.highlightTableId;
  const stackNavigation = navigation.getParent<NativeStackNavigationProp<WaiterStackParamList>>();
  const sortedTasks = useMemo(
    () => sortWaiterQueueTasks(data?.tasks ?? [], highlightTableId),
    [data?.tasks, highlightTableId],
  );

  const pull = useCallback(async (withLoader = false) => {
    if (withLoader) setLoading(true);
    try {
      const next = await fetchWaiterQueue();
      setData(next);
      setErrorText("");
    } catch {
      setErrorText("Не удалось загрузить очередь.");
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
    const timer = setInterval(() => setNow(Date.now()), 1_000);
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

  const runTaskAction = async (task: WaiterTask, action: "ack" | "start" | "complete") => {
    setBusyTaskId(task.id);
    try {
      if (action === "ack") {
        await ackWaiterTask(task.id);
      } else if (action === "start") {
        await startWaiterTask(task.id);
      } else {
        const mutationKey = completeMutationKeys[task.id] ?? createMutationKey("task-complete");
        setCompleteMutationKeys((prev) => ({ ...prev, [task.id]: mutationKey }));
        await completeWaiterTask(task.id, mutationKey);
        setCompleteMutationKeys((prev) => {
          const next = { ...prev };
          delete next[task.id];
          return next;
        });
      }
      setErrorText("");
      await pull(false);
    } catch {
      setErrorText("Не удалось обновить задачу.");
    } finally {
      setBusyTaskId(null);
    }
  };

  const header = useMemo(() => {
    if (!data) return null;
    return (
      <View style={styles.headerWrap}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.label}>Официант</Text>
            <Text style={styles.title}>Очередь</Text>
          </View>
          <View style={styles.summaryPill}>
            <Text style={styles.summaryPillText}>Срочно: {data.summary.urgentCount}</Text>
          </View>
        </View>

        <View style={styles.summaryRow}>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{data.summary.inProgressCount}</Text>
            <Text style={styles.metricLabel}>В работе</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{data.summary.activeTablesCount}</Text>
            <Text style={styles.metricLabel}>Активные столы</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{data.tasks.length}</Text>
            <Text style={styles.metricLabel}>Задачи</Text>
          </View>
        </View>

        {!connected ? <View style={styles.banner}><Text style={styles.bannerText}>Нет связи.</Text></View> : null}

        {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}
      </View>
    );
  }, [connected, data, errorText]);

  if (loading && !data) {
    return (
      <SafeAreaView style={[styles.safeArea, styles.center]} edges={["top"]}>
        <ActivityIndicator color={colors.navy} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <FlatList
        data={sortedTasks}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={header}
        ListEmptyComponent={<Text style={styles.empty}>Сейчас задач нет.</Text>}
        contentContainerStyle={styles.content}
        renderItem={({ item }) => {
          const highlighted = highlightTableId === item.tableId;
          const busy = busyTaskId === item.id;
          return (
            <View style={[styles.taskCard, highlighted && styles.taskCardHighlighted]}>
              <View style={styles.taskHead}>
                <View style={styles.taskHeadCopy}>
                  <Text style={styles.taskTitle}>{taskHumanTitle(item)}</Text>
                  <Text style={styles.taskMeta}>Стол {item.tableId} · {taskTypeLabel(item)} · {taskStatusLabel(item)}</Text>
                </View>
                <View style={styles.requestBadge}>
                  <Text style={styles.requestBadgeText}>
                    {item.type === "bill_request" ? "Счёт" : item.type === "waiter_call" ? "Вызов" : "Задача"}
                  </Text>
                </View>
              </View>

              {taskHumanSubtitle(item) ? <Text style={styles.taskSubtitle}>{taskHumanSubtitle(item)}</Text> : null}

              <Text style={styles.taskTiming}>С {formatTime(item.createdAt)} · {formatDurationFrom(item.createdAt, now)}</Text>
              {item.dueAt ? <Text style={styles.taskTiming}>До {formatTime(item.dueAt)}</Text> : null}

              <View style={styles.actionsRow}>
                <Pressable
                  style={styles.secondaryButton}
                  onPress={() => stackNavigation?.navigate("WaiterTable", { tableId: item.tableId })}
                >
                  <Text style={styles.secondaryButtonText}>Открыть</Text>
                </Pressable>

                {item.status === "open" ? (
                  <Pressable
                    style={[styles.secondaryButton, busy && styles.buttonDisabled]}
                    disabled={busy}
                    onPress={() => void runTaskAction(item, "ack")}
                  >
                    <Text style={styles.secondaryButtonText}>{busy ? "..." : "Принять"}</Text>
                  </Pressable>
                ) : null}

                {item.status === "open" || item.status === "acknowledged" ? (
                  <Pressable
                    style={[styles.secondaryButton, busy && styles.buttonDisabled]}
                    disabled={busy}
                    onPress={() => void runTaskAction(item, "start")}
                  >
                    <Text style={styles.secondaryButtonText}>{busy ? "..." : "Начать"}</Text>
                  </Pressable>
                ) : null}

                {item.status !== "completed" && item.status !== "cancelled" ? (
                  <Pressable
                    style={[styles.primaryButton, busy && styles.buttonDisabled]}
                    disabled={busy}
                    onPress={() => void runTaskAction(item, "complete")}
                  >
                    <Text style={styles.primaryButtonText}>{busy ? "..." : "Готово"}</Text>
                  </Pressable>
                ) : null}
              </View>
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
  content: {
    padding: 14,
    paddingBottom: 28,
    gap: 10,
  },
  headerWrap: {
    gap: 12,
    marginBottom: 8,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  label: {
    textTransform: "uppercase",
    fontSize: 11,
    color: colors.muted,
    letterSpacing: 1,
  },
  title: {
    marginTop: 2,
    fontSize: 28,
    fontWeight: "700",
    color: colors.navyDeep,
  },
  summaryPill: {
    borderRadius: 999,
    backgroundColor: "#F6ECE0",
    borderWidth: 1,
    borderColor: "#E8D6B5",
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  summaryPillText: {
    color: "#8A6A33",
    fontWeight: "700",
    fontSize: 12,
  },
  summaryRow: {
    flexDirection: "row",
    gap: 8,
  },
  metricCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    padding: 12,
    minHeight: 98,
    justifyContent: "space-between",
  },
  metricValue: {
    color: colors.navyDeep,
    fontSize: 20,
    fontWeight: "700",
  },
  metricLabel: {
    marginTop: 8,
    color: colors.muted,
    fontSize: 12,
    minHeight: 32,
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
  empty: {
    textAlign: "center",
    color: colors.muted,
    marginTop: 42,
  },
  taskCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    padding: 14,
    gap: 8,
  },
  taskCardHighlighted: {
    borderWidth: 2,
    borderColor: colors.gold,
  },
  taskHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },
  taskHeadCopy: {
    flex: 1,
  },
  taskTitle: {
    color: colors.navyDeep,
    fontSize: 17,
    fontWeight: "700",
  },
  taskMeta: {
    marginTop: 4,
    color: colors.navy,
    fontWeight: "600",
    fontSize: 12,
  },
  taskSubtitle: {
    color: colors.text,
    fontSize: 14,
  },
  requestBadge: {
    minWidth: 60,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E8D6B5",
    backgroundColor: "#FFF1DE",
    alignItems: "center",
    justifyContent: "center",
  },
  requestBadgeText: {
    color: "#8A6A33",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
  },
  taskTiming: {
    color: colors.muted,
    fontSize: 12,
  },
  actionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  secondaryButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  secondaryButtonText: {
    color: colors.navy,
    fontWeight: "600",
    fontSize: 12,
  },
  primaryButton: {
    borderRadius: 999,
    backgroundColor: colors.gold,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  primaryButtonText: {
    color: colors.navyDeep,
    fontWeight: "700",
    fontSize: 12,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
