import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { fetchHallData } from "../../api/client";
import { colors } from "../../theme/colors";
import type { HallData } from "../../types/domain";

export function ManagerWaitersScreen() {
  const [hall, setHall] = useState<HallData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorText, setErrorText] = useState("");

  const pull = useCallback(async (withLoader = false) => {
    if (withLoader) setLoading(true);
    try {
      const next = await fetchHallData();
      setHall(next);
      setErrorText("");
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "Не удалось загрузить официантов");
    } finally {
      if (withLoader) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void pull(true);
  }, [pull]);

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
        <Text style={styles.title}>Официанты</Text>
      </View>
      {errorText ? <Text style={styles.error}>{errorText}</Text> : null}
      <FlatList
        data={hall?.waiters || []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => {
          setRefreshing(true);
          await pull(false);
          setRefreshing(false);
        }} />}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.rowBetween}>
              <Text style={styles.name}>{item.name}</Text>
              <View style={[styles.statusPill, item.active ? styles.activePill : styles.inactivePill]}>
                <Text style={[styles.statusText, item.active ? styles.activeText : styles.inactiveText]}>
                  {item.active ? "Активен" : "Неактивен"}
                </Text>
              </View>
            </View>
            <Text style={styles.login}>Логин: {item.login}</Text>
            <Text style={styles.tables}>Столы: {item.tableIds.length > 0 ? item.tableIds.join(", ") : "—"}</Text>
          </View>
        )}
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
    paddingTop: 16,
  },
  title: {
    fontSize: 30,
    fontWeight: "700",
    color: colors.navyDeep,
  },
  error: {
    marginTop: 8,
    paddingHorizontal: 16,
    color: "#B42318",
  },
  listContent: {
    padding: 12,
    gap: 8,
  },
  card: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    padding: 12,
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  name: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.navyDeep,
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  activePill: {
    backgroundColor: "#EAF3DE",
  },
  inactivePill: {
    backgroundColor: "#F4E4E4",
  },
  statusText: {
    fontSize: 11,
    fontWeight: "700",
  },
  activeText: {
    color: "#2D6A4F",
  },
  inactiveText: {
    color: "#9D1C1C",
  },
  login: {
    marginTop: 8,
    color: colors.muted,
  },
  tables: {
    marginTop: 4,
    color: colors.navy,
    fontWeight: "600",
  },
});
