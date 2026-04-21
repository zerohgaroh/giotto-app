import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useEffect, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { fetchManagerReviews } from "../../api/client";
import type { ManagerStackParamList } from "../../navigation/types";
import { useRealtimeRefresh } from "../../realtime/useRealtimeRefresh";
import { colors } from "../../theme/colors";
import { formatTime } from "../../theme/format";
import type { ReviewHistoryPage } from "../../types/domain";

type Props = NativeStackScreenProps<ManagerStackParamList, "ManagerReviews">;

function ReviewStars({ rating }: { rating: number }) {
  return (
    <View style={styles.starsRow}>
      {Array.from({ length: 5 }, (_, index) => {
        const filled = index + 1 <= rating;
        return (
          <Ionicons
            key={`${rating}-${index}`}
            name={filled ? "star" : "star-outline"}
            size={15}
            color={filled ? "#C4A258" : "#B9C0CC"}
          />
        );
      })}
    </View>
  );
}

export function ManagerReviewsScreen({ navigation, route }: Props) {
  const [data, setData] = useState<ReviewHistoryPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [errorText, setErrorText] = useState("");

  const waiterId = route.params?.waiterId;
  const waiterName = route.params?.waiterName;

  const pull = useCallback(
    async (cursor?: string) => {
      const next = await fetchManagerReviews({
        waiterId,
        cursor,
        limit: 20,
      });
      setData((current) =>
        cursor && current
          ? {
              analytics: next.analytics,
              items: [...current.items, ...next.items],
              nextCursor: next.nextCursor,
            }
          : next,
      );
    },
    [waiterId],
  );

  useEffect(() => {
    setLoading(true);
    void (async () => {
      try {
        await pull();
        setErrorText("");
      } catch {
        setErrorText("Не удалось загрузить отзывы.");
      } finally {
        setLoading(false);
      }
    })();
  }, [pull]);

  useRealtimeRefresh({
    refresh: pull,
  });

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await pull();
      setErrorText("");
    } catch {
      setErrorText("Не удалось обновить отзывы.");
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

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={18} color={colors.navy} />
          <Text style={styles.backText}>Назад</Text>
        </Pressable>
        <Text style={styles.title}>{waiterName ? `Отзывы: ${waiterName}` : "Отзывы гостей"}</Text>
      </View>

      {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {data ? (
          <View style={styles.analyticsCard}>
            <View style={styles.analyticsCell}>
              <Text style={styles.analyticsValue}>{data.analytics.avgRating.toFixed(1)}</Text>
              <Text style={styles.analyticsLabel}>Средний балл</Text>
            </View>
            <View style={styles.analyticsCell}>
              <Text style={styles.analyticsValue}>{data.analytics.reviewsCount}</Text>
              <Text style={styles.analyticsLabel}>Всего отзывов</Text>
            </View>
            <View style={styles.analyticsCell}>
              <Text style={styles.analyticsValue}>{data.analytics.commentsCount}</Text>
              <Text style={styles.analyticsLabel}>С комментарием</Text>
            </View>
          </View>
        ) : null}

        {loading ? <Text style={styles.meta}>Загрузка...</Text> : null}

        {data?.items.map((item) => (
          <View key={item.id} style={styles.card}>
            <View style={styles.rowBetween}>
              <ReviewStars rating={item.rating} />
              <Text style={styles.cardDate}>{formatTime(item.createdAt)}</Text>
            </View>

            <Text style={styles.cardMeta}>Стол №{item.tableId}</Text>
            <Text style={styles.cardMeta}>Официант: {item.waiterName ?? "Без назначения"}</Text>

            {item.comment ? (
              <Text style={styles.cardComment}>{item.comment}</Text>
            ) : (
              <Text style={styles.cardCommentEmpty}>Комментарий не оставлен</Text>
            )}
          </View>
        ))}

        {data?.items.length === 0 && !loading ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>Пока нет отзывов.</Text>
          </View>
        ) : null}

        {data?.nextCursor ? (
          <Pressable style={styles.moreButton} onPress={() => void onLoadMore()} disabled={loadingMore}>
            <Text style={styles.moreButtonText}>{loadingMore ? "..." : "Загрузить ещё"}</Text>
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
    paddingTop: 12,
    gap: 8,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
  },
  backText: {
    color: colors.navy,
    fontWeight: "700",
    fontSize: 13,
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
    color: colors.navyDeep,
  },
  errorText: {
    marginTop: 8,
    marginHorizontal: 16,
    color: "#B42318",
  },
  content: {
    padding: 16,
    paddingTop: 10,
    gap: 12,
  },
  analyticsCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    padding: 12,
    flexDirection: "row",
    gap: 8,
  },
  analyticsCell: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  analyticsValue: {
    color: colors.navyDeep,
    fontSize: 21,
    fontWeight: "800",
  },
  analyticsLabel: {
    color: colors.muted,
    fontSize: 11,
    textAlign: "center",
  },
  meta: {
    color: colors.muted,
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#D9D2C6",
    backgroundColor: colors.white,
    padding: 12,
    gap: 6,
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  starsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  cardDate: {
    color: colors.muted,
    fontSize: 12,
  },
  cardMeta: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  cardComment: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 2,
  },
  cardCommentEmpty: {
    color: "#9A9285",
    fontSize: 13,
    fontStyle: "italic",
    marginTop: 2,
  },
  emptyCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    padding: 14,
  },
  emptyText: {
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
