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
import { closeManagerTable, fetchManagerTable, reassignManagerTable } from "../../api/client";
import { StatusBadge } from "../../components/StatusBadge";
import { useStaffRealtime } from "../../realtime/useStaffRealtime";
import { colors } from "../../theme/colors";
import { formatDurationFrom, formatPrice, formatTime } from "../../theme/format";
import type { ManagerTableDetail, RealtimeEvent } from "../../types/domain";

type Props = {
  tableId: number;
  onBack?: () => void;
  onMutated?: () => void;
};

export function ManagerTablePanel({ tableId, onBack, onMutated }: Props) {
  const [data, setData] = useState<ManagerTableDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingAction, setSavingAction] = useState<string | null>(null);
  const [errorText, setErrorText] = useState("");
  const [now, setNow] = useState(Date.now());

  const pull = useCallback(async (withLoader = false) => {
    if (withLoader) setLoading(true);
    try {
      const next = await fetchManagerTable(tableId);
      setData(next);
      setErrorText("");
    } catch {
      setErrorText("Не удалось загрузить стол.");
    } finally {
      if (withLoader) setLoading(false);
    }
  }, [tableId]);

  useEffect(() => {
    void pull(true);
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [pull]);

  const handleRealtime = useCallback(
    (event: RealtimeEvent) => {
      if (event.tableId !== tableId) return;
      void pull(false);
      onMutated?.();
    },
    [onMutated, pull, tableId],
  );

  const { connected } = useStaffRealtime(handleRealtime);

  const onRefresh = async () => {
    setRefreshing(true);
    await pull(false);
    setRefreshing(false);
  };

  const onReassign = async (waiterId?: string) => {
    setSavingAction(waiterId ?? "unassigned");
    try {
      const next = await reassignManagerTable(tableId, waiterId);
      setData(next);
      setErrorText("");
      onMutated?.();
    } catch {
      setErrorText("Не удалось изменить назначение.");
    } finally {
      setSavingAction(null);
    }
  };

  const onCloseTable = async () => {
    setSavingAction("close");
    try {
      const next = await closeManagerTable(tableId);
      setData(next);
      setErrorText("");
      onMutated?.();
    } catch {
      setErrorText("Не удалось закрыть стол.");
    } finally {
      setSavingAction(null);
    }
  };

  const total = useMemo(
    () => (data?.billLines || []).reduce((sum, line) => sum + line.qty * line.price, 0),
    [data?.billLines],
  );

  if (loading || !data) {
    return (
      <View style={[styles.center, styles.fill]}>
        <ActivityIndicator color={colors.navy} />
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.topRow}>
        {onBack ? (
          <Pressable style={styles.backButton} onPress={onBack}>
            <Text style={styles.backButtonText}>Назад</Text>
          </Pressable>
        ) : (
          <View />
        )}
        <StatusBadge status={data.table.status} />
      </View>

      <Text style={styles.title}>Стол {tableId}</Text>
      <Text style={styles.subtitle}>
        {data.table.hasActiveSession ? `За столом ${formatDurationFrom(data.table.guestStartedAt, now)}` : "Нет активной сессии"}
      </Text>

      {!connected ? <View style={styles.banner}><Text style={styles.bannerText}>Нет связи.</Text></View> : null}

      {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Назначение</Text>
        <Text style={styles.metaText}>
          Официант:{" "}
          {data.assignedWaiterId
            ? data.availableWaiters.find((waiter) => waiter.id === data.assignedWaiterId)?.name || data.assignedWaiterId
            : "Не назначен"}
        </Text>
        <View style={styles.chips}>
          <Pressable
            style={[
              styles.waiterChip,
              !data.assignedWaiterId && styles.waiterChipActive,
              savingAction === "unassigned" && styles.waiterChipDisabled,
            ]}
            onPress={() => void onReassign(undefined)}
            disabled={savingAction !== null}
          >
            <Text style={[styles.waiterChipText, !data.assignedWaiterId && styles.waiterChipTextActive]}>Снять</Text>
          </Pressable>
          {data.availableWaiters.map((waiter) => (
            <Pressable
              key={waiter.id}
              style={[
                styles.waiterChip,
                data.assignedWaiterId === waiter.id && styles.waiterChipActive,
                savingAction === waiter.id && styles.waiterChipDisabled,
              ]}
              onPress={() => void onReassign(waiter.id)}
              disabled={savingAction !== null}
            >
              <Text style={[styles.waiterChipText, data.assignedWaiterId === waiter.id && styles.waiterChipTextActive]}>
                {waiter.name}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Запросы</Text>
        {data.requests.length === 0 ? (
          <Text style={styles.emptyText}>Нет активных запросов.</Text>
        ) : (
          data.requests.map((request) => (
            <View key={request.id} style={styles.rowCard}>
              <Text style={styles.rowTitle}>{request.type === "bill" ? "Запросили счёт" : "Вызвали официанта"}</Text>
              <Text style={styles.rowMeta}>{request.reason}</Text>
              <Text style={styles.rowMeta}>{formatTime(request.createdAt)}</Text>
            </View>
          ))
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Счёт</Text>
        {data.billLines.length === 0 ? (
          <Text style={styles.emptyText}>Пока пусто.</Text>
        ) : (
          data.billLines.map((line) => (
            <View key={line.id} style={styles.billRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>
                  {line.title} x {line.qty}
                </Text>
                <Text style={styles.rowMeta}>{line.source === "guest" ? "Гость" : "Официант"}</Text>
                {line.note ? <Text style={styles.rowMeta}>Заметка: {line.note}</Text> : null}
              </View>
              <Text style={styles.billAmount}>{formatPrice(line.qty * line.price)}</Text>
            </View>
          ))
        )}
        <Text style={styles.totalText}>Итого: {formatPrice(total)}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Заметка</Text>
        <Text style={styles.noteText}>{data.note || "Пусто"}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Отзыв</Text>
        <Text style={styles.metaText}>{data.reviewPrompt ? `До ${formatTime(data.reviewPrompt.expiresAt)}` : "Нет активного окна"}</Text>
      </View>

      <Pressable
        style={[styles.closeButton, (!data.table.hasActiveSession || savingAction === "close") && styles.closeButtonDisabled]}
        onPress={() => void onCloseTable()}
        disabled={!data.table.hasActiveSession || savingAction !== null}
      >
        <Text style={styles.closeButtonText}>{savingAction === "close" ? "..." : "Закрыть стол"}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  center: {
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    padding: 16,
    gap: 12,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  backButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  backButtonText: {
    color: colors.navy,
    fontWeight: "600",
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
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    padding: 12,
    gap: 8,
  },
  cardTitle: {
    color: colors.navyDeep,
    fontWeight: "700",
    fontSize: 17,
  },
  metaText: {
    color: colors.muted,
    fontSize: 13,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  waiterChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.white,
  },
  waiterChipActive: {
    borderColor: colors.navy,
    backgroundColor: colors.navy,
  },
  waiterChipDisabled: {
    opacity: 0.6,
  },
  waiterChipText: {
    color: colors.navy,
    fontWeight: "600",
  },
  waiterChipTextActive: {
    color: colors.white,
  },
  emptyText: {
    color: colors.muted,
  },
  rowCard: {
    borderRadius: 12,
    backgroundColor: colors.cream,
    padding: 10,
    gap: 4,
  },
  rowTitle: {
    color: colors.navyDeep,
    fontWeight: "600",
  },
  rowMeta: {
    color: colors.muted,
    fontSize: 12,
  },
  billRow: {
    flexDirection: "row",
    gap: 8,
  },
  billAmount: {
    color: colors.navyDeep,
    fontWeight: "700",
  },
  totalText: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    color: colors.navyDeep,
    fontWeight: "700",
    fontSize: 15,
  },
  noteText: {
    color: colors.text,
    lineHeight: 20,
  },
  closeButton: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: "#B42318",
    alignItems: "center",
    justifyContent: "center",
  },
  closeButtonDisabled: {
    opacity: 0.6,
  },
  closeButtonText: {
    color: colors.white,
    fontWeight: "700",
    fontSize: 15,
  },
});
