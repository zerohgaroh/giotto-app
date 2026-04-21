import { Ionicons } from "@expo/vector-icons";
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
import { fetchWaiterQueue, fetchWaiterReviews, fetchWaiterShiftSummary } from "../../api/client";
import type { WaiterTabParamList } from "../../navigation/types";
import { useRealtimeRefresh } from "../../realtime/useRealtimeRefresh";
import { colors } from "../../theme/colors";
import { formatDurationFrom, formatTime } from "../../theme/format";
import type { ReviewHistoryPage, WaiterQueueResponse, WaiterShiftSummary } from "../../types/domain";
import { getVisibleWaiterTasks } from "./waiterBusiness";

type Props = BottomTabScreenProps<WaiterTabParamList, "WaiterShift">;

const EMPTY_REVIEW_PAGE: ReviewHistoryPage = {
  analytics: {
    avgRating: 0,
    reviewsCount: 0,
    commentsCount: 0,
    distribution: {
      rating1: 0,
      rating2: 0,
      rating3: 0,
      rating4: 0,
      rating5: 0,
    },
  },
  items: [],
};

function normalizeShiftSummary(summary: WaiterShiftSummary): WaiterShiftSummary {
  return {
    ...summary,
    avgRatingAllTime: Number(summary.avgRatingAllTime ?? 0),
    reviewsCountAllTime: Number(summary.reviewsCountAllTime ?? 0),
    commentsCountAllTime: Number(summary.commentsCountAllTime ?? 0),
  };
}

function ReviewStars({ rating }: { rating: number }) {
  return (
    <View style={styles.reviewStarsRow}>
      {Array.from({ length: 5 }, (_, index) => {
        const filled = index + 1 <= rating;
        return (
          <Ionicons
            key={`${rating}-${index}`}
            name={filled ? "star" : "star-outline"}
            size={14}
            color={filled ? "#C4A258" : "#B9C0CC"}
          />
        );
      })}
    </View>
  );
}

export function WaiterShiftScreen(_props: Props) {
  const [summary, setSummary] = useState<WaiterShiftSummary | null>(null);
  const [queue, setQueue] = useState<WaiterQueueResponse | null>(null);
  const [reviews, setReviews] = useState<ReviewHistoryPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMoreReviews, setLoadingMoreReviews] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [now, setNow] = useState(Date.now());

  const pull = useCallback(async (withLoader = false) => {
    if (withLoader) setLoading(true);
    try {
      const [nextSummaryRaw, nextQueue] = await Promise.all([fetchWaiterShiftSummary(), fetchWaiterQueue()]);
      const nextSummary = normalizeShiftSummary(nextSummaryRaw);
      setSummary(nextSummary);
      setQueue(nextQueue);
      try {
        const nextReviews = await fetchWaiterReviews({ limit: 20 });
        setReviews(nextReviews);
      } catch {
        setReviews((current) => current ?? EMPTY_REVIEW_PAGE);
      }
      setErrorText("");
    } catch {
      setErrorText("Не удалось загрузить аналитику смены.");
    } finally {
      if (withLoader) setLoading(false);
    }
  }, []);

  const { connected } = useRealtimeRefresh({
    refresh: useCallback(() => pull(false), [pull]),
  });

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

  const onLoadMoreReviews = async () => {
    if (!reviews?.nextCursor || loadingMoreReviews) return;
    setLoadingMoreReviews(true);
    try {
      const next = await fetchWaiterReviews({
        cursor: reviews.nextCursor,
        limit: 20,
      });
      setReviews((current) =>
        current
          ? {
              analytics: next.analytics,
              items: [...current.items, ...next.items],
              nextCursor: next.nextCursor,
            }
          : next,
      );
      setErrorText("");
    } catch {
      setErrorText("Не удалось загрузить ещё отзывы.");
    } finally {
      setLoadingMoreReviews(false);
    }
  };

  const chartData = useMemo(() => {
    if (!summary || !queue) return [];
    const visibleTasks = getVisibleWaiterTasks(queue.tasks);
    return [
      { label: "Новые задачи", value: visibleTasks.length },
      { label: "Срочные", value: queue.summary.urgentCount },
      { label: "Выполнено", value: summary.tasksHandled },
      { label: "Закрыто столов", value: summary.serviceCompletedCount },
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
              <Text style={styles.metricLabel}>Выполнено</Text>
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
              <Text style={styles.metricLabel}>Закрыто столов</Text>
            </View>
          </View>
        ) : null}

        {summary ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Отзывы гостей</Text>
            <View style={styles.reviewMetricsRow}>
              <View style={styles.reviewMetricCell}>
                <Text style={styles.reviewMetricValue}>{summary.avgRatingAllTime.toFixed(1)}</Text>
                <Text style={styles.reviewMetricLabel}>Средний балл</Text>
              </View>
              <View style={styles.reviewMetricCell}>
                <Text style={styles.reviewMetricValue}>{summary.reviewsCountAllTime}</Text>
                <Text style={styles.reviewMetricLabel}>Всего отзывов</Text>
              </View>
              <View style={styles.reviewMetricCell}>
                <Text style={styles.reviewMetricValue}>{summary.commentsCountAllTime}</Text>
                <Text style={styles.reviewMetricLabel}>С комментарием</Text>
              </View>
            </View>

            {reviews?.items.map((item) => (
              <View key={item.id} style={styles.reviewCard}>
                <View style={styles.reviewRowBetween}>
                  <ReviewStars rating={item.rating} />
                  <Text style={styles.reviewDate}>{formatTime(item.createdAt)}</Text>
                </View>
                {item.comment ? (
                  <Text style={styles.reviewComment}>{item.comment}</Text>
                ) : (
                  <Text style={styles.reviewCommentEmpty}>Комментарий не оставлен</Text>
                )}
              </View>
            ))}

            {reviews?.items.length === 0 ? <Text style={styles.meta}>Пока нет отзывов.</Text> : null}

            {reviews?.nextCursor ? (
              <Pressable
                style={styles.moreReviewsButton}
                onPress={() => void onLoadMoreReviews()}
                disabled={loadingMoreReviews}
              >
                <Text style={styles.moreReviewsButtonText}>{loadingMoreReviews ? "..." : "Загрузить ещё"}</Text>
              </Pressable>
            ) : null}
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
              <Text style={styles.queueStatValue}>{queue ? getVisibleWaiterTasks(queue.tasks).length : 0}</Text>
              <Text style={styles.queueStatLabel}>Новые задачи</Text>
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
  meta: {
    color: colors.muted,
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
  reviewMetricsRow: {
    flexDirection: "row",
    gap: 8,
  },
  reviewMetricCell: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: "#FFFDF8",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 6,
    gap: 2,
  },
  reviewMetricValue: {
    color: colors.navyDeep,
    fontSize: 20,
    fontWeight: "800",
  },
  reviewMetricLabel: {
    color: colors.muted,
    fontSize: 11,
    textAlign: "center",
  },
  reviewCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: "#FFFDF8",
    padding: 10,
    gap: 4,
  },
  reviewRowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  reviewStarsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  reviewDate: {
    color: colors.muted,
    fontSize: 12,
  },
  reviewComment: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 18,
  },
  reviewCommentEmpty: {
    color: "#9A9285",
    fontSize: 12,
    fontStyle: "italic",
  },
  moreReviewsButton: {
    minHeight: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.navy,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  moreReviewsButtonText: {
    color: colors.navy,
    fontWeight: "700",
  },
});
