import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { closeManagerTable, fetchManagerTable, reassignManagerTable } from "../../api/client";
import { StatusBadge } from "../../components/StatusBadge";
import { useRealtimeRefresh } from "../../realtime/useRealtimeRefresh";
import { colors } from "../../theme/colors";
import { formatDurationFrom, formatTime } from "../../theme/format";
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

  const pull = useCallback(
    async (withLoader = false) => {
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
    },
    [tableId],
  );

  useEffect(() => {
    void pull(true);
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [pull]);

  const { connected, connecting } = useRealtimeRefresh({
    filter: useCallback((event: RealtimeEvent) => event.tableId === tableId, [tableId]),
    refresh: useCallback(async () => {
      await pull(false);
      onMutated?.();
    }, [onMutated, pull]),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await pull(false);
    setRefreshing(false);
  }, [pull]);

  const onReassign = useCallback(
    async (waiterId?: string) => {
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
    },
    [onMutated, tableId],
  );

  const onCloseTable = useCallback(async () => {
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
  }, [onMutated, tableId]);

  const openGuestLink = useCallback(async () => {
    if (!data?.guestLink?.url) return;
    try {
      await Linking.openURL(data.guestLink.url);
    } catch {
      setErrorText("Не удалось открыть ссылку.");
    }
  }, [data?.guestLink?.url]);

  const shareGuestLink = useCallback(async () => {
    if (!data?.guestLink?.url) return;
    try {
      await Share.share({
        message: data.guestLink.url,
        url: data.guestLink.url,
      });
    } catch {
      setErrorText("Не удалось поделиться ссылкой.");
    }
  }, [data?.guestLink?.url]);

  const requests = data?.requests ?? [];
  const availableWaiters = data?.availableWaiters ?? [];
  const guestLinkUrl = data?.guestLink?.url ?? "";
  const activeRequests = useMemo(() => requests.filter((request) => !request.resolvedAt), [requests]);

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
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.topRow}>
        {onBack ? (
          <Pressable style={styles.backButton} onPress={onBack}>
            <Ionicons name="close" size={18} color={colors.navy} />
            <Text style={styles.backButtonText}>Закрыть</Text>
          </Pressable>
        ) : (
          <View />
        )}
        <StatusBadge status={data.table.status} />
      </View>

      <Text style={styles.title}>Стол {tableId}</Text>
      <Text style={styles.subtitle}>
        {data.table.hasActiveSession ? `За столом ${formatDurationFrom(data.table.guestStartedAt, now)}` : "Сессия не активна"}
      </Text>

      {!connected && !connecting ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>Нет live-обновлений. Потяните экран вниз, чтобы обновить данные.</Text>
        </View>
      ) : null}

      {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Ссылка стола</Text>
        <Text style={styles.metaText}>Эта ссылка работает постоянно для этого стола.</Text>
        <View style={styles.linkBox}>
          <Text style={styles.linkText} selectable>
            {guestLinkUrl || "Ссылка пока недоступна."}
          </Text>
        </View>
        <View style={styles.linkActions}>
          <Pressable style={styles.secondaryWideButton} onPress={() => void openGuestLink()} disabled={!guestLinkUrl}>
            <Ionicons name="open-outline" size={18} color={colors.navy} />
            <Text style={styles.secondaryWideButtonText}>Открыть</Text>
          </Pressable>
          <Pressable style={styles.secondaryWideButton} onPress={() => void shareGuestLink()} disabled={!guestLinkUrl}>
            <Ionicons name="share-social-outline" size={18} color={colors.navy} />
            <Text style={styles.secondaryWideButtonText}>Поделиться</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Назначение</Text>
        <Text style={styles.metaText}>
          Официант:{" "}
          {data.assignedWaiterId
            ? availableWaiters.find((waiter) => waiter.id === data.assignedWaiterId)?.name || data.assignedWaiterId
            : "Не назначен"}
        </Text>
        <View style={styles.chips}>
          <Pressable
            style={[
              styles.waiterChip,
              !data.assignedWaiterId ? styles.waiterChipActive : null,
              savingAction === "unassigned" ? styles.waiterChipDisabled : null,
            ]}
            onPress={() => void onReassign(undefined)}
            disabled={savingAction !== null}
          >
            <Text style={[styles.waiterChipText, !data.assignedWaiterId ? styles.waiterChipTextActive : null]}>
              Снять
            </Text>
          </Pressable>
          {availableWaiters.map((waiter) => (
            <Pressable
              key={waiter.id}
              style={[
                styles.waiterChip,
                data.assignedWaiterId === waiter.id ? styles.waiterChipActive : null,
                savingAction === waiter.id ? styles.waiterChipDisabled : null,
              ]}
              onPress={() => void onReassign(waiter.id)}
              disabled={savingAction !== null}
            >
              <Text
                style={[
                  styles.waiterChipText,
                  data.assignedWaiterId === waiter.id ? styles.waiterChipTextActive : null,
                ]}
              >
                {waiter.name}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Запросы</Text>
        {activeRequests.length === 0 ? (
          <Text style={styles.emptyText}>Активных запросов нет.</Text>
        ) : (
          activeRequests.map((request) => (
            <View key={request.id} style={styles.rowCard}>
              <Text style={styles.rowTitle}>
                {request.type === "bill" ? "Запросили счёт" : "Вызвали официанта"}
              </Text>
              <Text style={styles.rowMeta}>{request.reason}</Text>
              <Text style={styles.rowMeta}>{formatTime(request.createdAt)}</Text>
            </View>
          ))
        )}
      </View>

      <Pressable
        style={[
          styles.closeButton,
          !data.table.hasActiveSession || savingAction === "close" ? styles.closeButtonDisabled : null,
        ]}
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
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  backButtonText: {
    color: colors.navy,
    fontWeight: "700",
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: colors.navyDeep,
  },
  subtitle: {
    color: colors.navy,
    fontWeight: "600",
  },
  banner: {
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
    color: "#B42318",
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#D9D2C6",
    backgroundColor: colors.white,
    padding: 14,
    gap: 10,
    shadowColor: "#0A1F4A",
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  cardTitle: {
    color: colors.navyDeep,
    fontWeight: "800",
    fontSize: 18,
  },
  metaText: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  linkBox: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: "#FBF8F2",
    padding: 12,
  },
  linkText: {
    color: colors.navyDeep,
    fontSize: 13,
    lineHeight: 19,
  },
  linkActions: {
    flexDirection: "row",
    gap: 10,
  },
  secondaryWideButton: {
    minHeight: 44,
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  secondaryWideButtonText: {
    color: colors.navy,
    fontWeight: "700",
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
    borderRadius: 14,
    backgroundColor: "#FBF8F2",
    padding: 12,
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
  closeButton: {
    minHeight: 48,
    borderRadius: 16,
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
