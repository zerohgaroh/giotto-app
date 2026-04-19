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
import { fetchWaiterTables } from "../../api/client";
import type { WaiterStackParamList, WaiterTabParamList } from "../../navigation/types";
import { StatusBadge } from "../../components/StatusBadge";
import { useAuth } from "../../context/AuthContext";
import { useWaiterRealtime } from "../../realtime/useWaiterRealtime";
import { colors } from "../../theme/colors";
import { formatDurationFrom } from "../../theme/format";
import type { WaiterTablesResponse } from "../../types/domain";
import { sortWaiterTables } from "./attentionSort";

type Props = BottomTabScreenProps<WaiterTabParamList, "WaiterTables">;

export function WaiterHomeScreen({ navigation }: Props) {
  const { waiter, signOut } = useAuth();
  const [data, setData] = useState<WaiterTablesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [errorText, setErrorText] = useState("");

  const pull = useCallback(async (withLoader = false) => {
    if (withLoader) setLoading(true);
    try {
      const next = await fetchWaiterTables();
      setData(next);
      setErrorText("");
    } catch {
      setErrorText("Не удалось загрузить столы.");
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

    return () => {
      clearInterval(timer);
    };
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

  const activeCalls = useMemo(
    () => data?.tables.filter((table) => table.activeRequest).length ?? 0,
    [data?.tables],
  );
  const sortedTables = useMemo(() => sortWaiterTables(data?.tables ?? []), [data?.tables]);

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.label}>Официант</Text>
          <Text style={styles.title}>{data?.waiter.name || waiter?.name || "Сотрудник"}</Text>
        </View>
        <Pressable onPress={() => void signOut()} style={styles.logoutButton}>
          <Text style={styles.logoutText}>Выйти</Text>
        </Pressable>
      </View>

      <View style={styles.subHeader}>
        <Text style={styles.sectionTitle}>Мои столы</Text>
        <View style={styles.callsCounter}>
          <Text style={styles.callsCounterText}>Вызовы: {activeCalls}</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.navy} />
        </View>
      ) : (
        <FlatList
          data={sortedTables}
          keyExtractor={(item) => String(item.tableId)}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={<Text style={styles.empty}>Нет назначенных столов.</Text>}
          ListHeaderComponent={
            <View>
              {!connected ? <View style={styles.banner}><Text style={styles.bannerText}>Нет связи.</Text></View> : null}
              {errorText ? <Text style={styles.errorText}>{errorText}</Text> : <View style={styles.headerSpacer} />}
            </View>
          }
          renderItem={({ item }) => {
            const highlighted = item.status === "waiting" || item.status === "bill";
            const requestLabel =
              item.activeRequest?.type === "bill" ? "Запросили счёт" : item.activeRequest ? "Вызвали официанта" : "";
            const stackNavigation = navigation.getParent<NativeStackNavigationProp<WaiterStackParamList>>();

            return (
              <Pressable
                style={[styles.card, highlighted && styles.cardHighlighted]}
                onPress={() => stackNavigation?.navigate("WaiterTable", { tableId: item.tableId })}
              >
                <View style={styles.cardHead}>
                  <Text style={styles.cardTitle}>Стол {item.tableId}</Text>
                  <StatusBadge status={item.status} />
                </View>
                <Text style={styles.cardTime}>За столом {formatDurationFrom(item.guestStartedAt, now)}</Text>
                <Text style={styles.metaText}>Задачи: {item.openTasksCount} · Срочно: {item.urgentTasksCount}</Text>
                {requestLabel ? (
                  <Text style={styles.requestText} numberOfLines={2}>
                    {requestLabel}
                  </Text>
                ) : (
                  <Text style={styles.metaText}>Без запросов</Text>
                )}
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
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  label: {
    textTransform: "uppercase",
    fontSize: 11,
    color: colors.muted,
    letterSpacing: 1,
  },
  title: {
    marginTop: 2,
    fontSize: 22,
    fontWeight: "700",
    color: colors.navyDeep,
  },
  logoutButton: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: colors.white,
  },
  logoutText: {
    color: colors.navy,
    fontWeight: "600",
  },
  subHeader: {
    marginTop: 16,
    paddingHorizontal: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionTitle: {
    fontSize: 28,
    fontWeight: "700",
    color: colors.navyDeep,
  },
  callsCounter: {
    backgroundColor: "#F6ECE0",
    borderWidth: 1,
    borderColor: "#E8D6B5",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  callsCounterText: {
    color: "#8A6A33",
    fontSize: 11,
    fontWeight: "700",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  listContent: {
    paddingHorizontal: 12,
    paddingBottom: 24,
    paddingTop: 12,
  },
  row: {
    gap: 8,
  },
  banner: {
    marginHorizontal: 4,
    marginBottom: 8,
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
  card: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 10,
    marginBottom: 8,
    minHeight: 132,
  },
  cardHighlighted: {
    borderWidth: 2,
    borderColor: colors.gold,
  },
  cardHead: {
    gap: 8,
  },
  cardTitle: {
    fontWeight: "700",
    color: colors.navyDeep,
    fontSize: 16,
  },
  cardTime: {
    marginTop: 8,
    color: colors.navy,
    fontWeight: "600",
  },
  requestText: {
    marginTop: 8,
    color: "#8A6A33",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
  },
  metaText: {
    marginTop: 8,
    color: colors.muted,
    fontSize: 12,
  },
  empty: {
    textAlign: "center",
    marginTop: 36,
    color: colors.muted,
  },
  errorText: {
    color: "#B42318",
    marginHorizontal: 4,
    marginBottom: 10,
  },
  headerSpacer: {
    height: 2,
  },
});
