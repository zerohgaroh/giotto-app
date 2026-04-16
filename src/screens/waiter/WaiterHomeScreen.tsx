import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useEffect, useState } from "react";
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
import { fetchWaiterTables } from "../../api/client";
import { StatusBadge } from "../../components/StatusBadge";
import { useAuth } from "../../context/AuthContext";
import { colors } from "../../theme/colors";
import { formatDurationFrom } from "../../theme/format";
import type { WaiterTablesResponse } from "../../types/domain";
import type { WaiterStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<WaiterStackParamList, "WaiterHome">;

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
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "Не удалось загрузить столы");
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

  const onRefresh = async () => {
    setRefreshing(true);
    await pull(false);
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <View>
          <Text style={styles.label}>Giotto Waiter</Text>
          <Text style={styles.title}>{data?.waiter.name || waiter?.name || "Официант"}</Text>
        </View>
        <Pressable onPress={() => void signOut()} style={styles.logoutButton}>
          <Text style={styles.logoutText}>Выйти</Text>
        </Pressable>
      </View>

      <View style={styles.subHeader}>
        <Text style={styles.sectionTitle}>Мои столы</Text>
        <View style={styles.callsCounter}>
          <Text style={styles.callsCounterText}>
            Вызовы: {data?.tables.filter((t) => !!t.activeRequest).length || 0}
          </Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.navy} />
        </View>
      ) : (
        <FlatList
          data={data?.tables || []}
          keyExtractor={(item) => String(item.tableId)}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={<Text style={styles.empty}>Нет назначенных столов</Text>}
          ListHeaderComponent={
            errorText ? <Text style={styles.errorText}>{errorText}</Text> : <View style={{ height: 2 }} />
          }
          renderItem={({ item }) => {
            const highlighted = item.status === "waiting" || item.status === "bill";
            return (
              <Pressable
                style={[styles.card, highlighted && styles.cardHighlighted]}
                onPress={() => navigation.navigate("WaiterTable", { tableId: item.tableId })}
              >
                <View style={styles.cardHead}>
                  <Text style={styles.cardTitle}>Стол {item.tableId}</Text>
                  <StatusBadge status={item.status} />
                </View>
                <Text style={styles.cardTime}>⏱ {formatDurationFrom(item.guestStartedAt, now)}</Text>
                {item.activeRequest ? (
                  <Text style={styles.requestText} numberOfLines={2}>
                    🔔 {item.activeRequest.type === "bill" ? "Просит счёт" : "Ждёт официанта"}
                  </Text>
                ) : null}
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
  card: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 10,
    marginBottom: 8,
    minHeight: 128,
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
});
