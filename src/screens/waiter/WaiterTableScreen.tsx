import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  ackWaiterRequest,
  doneWaiter,
  fetchWaiterTable,
  setTableNote,
} from "../../api/client";
import { StatusBadge } from "../../components/StatusBadge";
import { colors } from "../../theme/colors";
import { formatDurationFrom, formatPrice, formatTime } from "../../theme/format";
import type { WaiterTableDetailResponse } from "../../types/domain";
import type { WaiterStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<WaiterStackParamList, "WaiterTable">;

export function WaiterTableScreen({ navigation, route }: Props) {
  const tableId = route.params.tableId;
  const [data, setData] = useState<WaiterTableDetailResponse | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingNote, setSavingNote] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [now, setNow] = useState(Date.now());

  const pull = useCallback(async (withLoader = false) => {
    if (withLoader) setLoading(true);
    try {
      const next = await fetchWaiterTable(tableId);
      setData(next);
      setNoteDraft((prev) => (prev === "" ? next.note || "" : prev));
      setErrorText("");
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "Не удалось загрузить стол");
    } finally {
      if (withLoader) setLoading(false);
    }
  }, [tableId]);

  useEffect(() => {
    void pull(true);
    const poll = setInterval(() => {
      void pull(false);
    }, 2500);
    const timer = setInterval(() => setNow(Date.now()), 1000);

    return () => {
      clearInterval(poll);
      clearInterval(timer);
    };
  }, [pull]);

  const doneCooldownLeft = useMemo(() => {
    if (!data?.table.doneCooldownUntil) return 0;
    return Math.max(0, data.table.doneCooldownUntil - now);
  }, [data?.table.doneCooldownUntil, now]);

  const total = useMemo(
    () => (data?.billLines || []).reduce((sum, line) => sum + line.qty * line.price, 0),
    [data?.billLines],
  );

  const onAck = async (requestId: string) => {
    try {
      const next = await ackWaiterRequest(tableId, requestId);
      setData(next);
      setErrorText("");
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "Не удалось принять вызов");
    }
  };

  const onDone = async () => {
    try {
      const next = await doneWaiter(tableId);
      setData(next);
      setErrorText("");
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "Не удалось завершить обслуживание");
    }
  };

  const onSaveNote = async () => {
    if (savingNote) return;
    setSavingNote(true);
    try {
      const next = await setTableNote(tableId, noteDraft);
      setData(next);
      setNoteDraft(next.note || "");
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "Не удалось сохранить заметку");
    } finally {
      setSavingNote(false);
    }
  };

  if (loading || !data) {
    return (
      <SafeAreaView style={[styles.safeArea, styles.center]}>
        <ActivityIndicator color={colors.navy} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.tableLabel}>Стол {tableId}</Text>
            <Text style={styles.timeSpent}>⏱ {formatDurationFrom(data.table.guestStartedAt, now)}</Text>
          </View>
          <StatusBadge status={data.table.status} />
        </View>

        {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}

        {(data.requests || []).map((request) => (
          <View key={request.id} style={styles.alertCard}>
            <Text style={styles.alertTitle}>
              {request.type === "bill" ? "Гость просит счёт" : "Гость вызывает официанта"}
            </Text>
            <Text style={styles.alertSub}>Причина: {request.reason}</Text>
            <Text style={styles.alertSub}>{formatTime(request.createdAt)}</Text>
            <Pressable style={styles.goldButton} onPress={() => void onAck(request.id)}>
              <Text style={styles.goldButtonText}>Принято — иду</Text>
            </Pressable>
          </View>
        ))}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Счёт стола</Text>
          {(data.billLines || []).length === 0 ? (
            <Text style={styles.emptyText}>Пока нет позиций.</Text>
          ) : (
            <View style={styles.linesList}>
              {data.billLines.map((line) => (
                <View key={line.id} style={styles.lineRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.lineTitle}>{line.title} × {line.qty}</Text>
                    {line.note ? <Text style={styles.lineNote}>↳ {line.note}</Text> : null}
                    <Text style={styles.lineSource}>[{line.source === "guest" ? "от гостя" : "добавил официант"}]</Text>
                  </View>
                  <Text style={styles.lineAmount}>{formatPrice(line.qty * line.price)}</Text>
                </View>
              ))}
            </View>
          )}
          <Text style={styles.total}>Итого: {formatPrice(total)}</Text>

          <Pressable
            style={styles.outlineButton}
            onPress={() => navigation.navigate("WaiterAddOrder", { tableId })}
          >
            <Text style={styles.outlineButtonText}>Добавить заказ</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Заметки (видны только вам)</Text>
          <TextInput
            value={noteDraft}
            onChangeText={setNoteDraft}
            onBlur={() => void onSaveNote()}
            multiline
            placeholder="аллергия на орехи, VIP..."
            style={styles.noteInput}
            placeholderTextColor="#8A847A"
          />
          <Pressable disabled={savingNote} style={styles.outlineButton} onPress={() => void onSaveNote()}>
            <Text style={styles.outlineButtonText}>{savingNote ? "Сохраняем..." : "Сохранить заметку"}</Text>
          </Pressable>
        </View>
      </ScrollView>

      <View style={styles.bottomBar}>
        <Pressable
          disabled={doneCooldownLeft > 0}
          style={[styles.doneButton, doneCooldownLeft > 0 && styles.doneButtonDisabled]}
          onPress={() => void onDone()}
        >
          <Text style={styles.doneButtonText}>
            {doneCooldownLeft > 0
              ? `Повтор через ${Math.ceil(doneCooldownLeft / 1000)}с`
              : "Все обслужил"}
          </Text>
        </Pressable>
      </View>
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
    paddingBottom: 110,
    gap: 12,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  tableLabel: {
    fontSize: 28,
    fontWeight: "700",
    color: colors.navyDeep,
  },
  timeSpent: {
    marginTop: 4,
    color: colors.navy,
    fontWeight: "600",
  },
  errorText: {
    color: "#B42318",
  },
  alertCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E8D6B5",
    backgroundColor: "#FFF8EC",
    padding: 12,
  },
  alertTitle: {
    color: "#8A6A33",
    fontWeight: "700",
    fontSize: 15,
  },
  alertSub: {
    marginTop: 4,
    color: colors.muted,
    fontSize: 12,
  },
  goldButton: {
    marginTop: 10,
    alignSelf: "flex-start",
    backgroundColor: colors.gold,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  goldButtonText: {
    color: colors.navyDeep,
    fontWeight: "700",
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    padding: 12,
  },
  cardTitle: {
    color: colors.navyDeep,
    fontSize: 18,
    fontWeight: "700",
  },
  emptyText: {
    marginTop: 8,
    color: colors.muted,
  },
  linesList: {
    marginTop: 10,
    gap: 10,
  },
  lineRow: {
    flexDirection: "row",
    gap: 8,
  },
  lineTitle: {
    color: colors.text,
    fontSize: 14,
  },
  lineAmount: {
    color: colors.navyDeep,
    fontWeight: "700",
  },
  lineNote: {
    color: colors.muted,
    fontSize: 12,
  },
  lineSource: {
    color: "#8C8880",
    fontSize: 11,
    marginTop: 2,
  },
  total: {
    marginTop: 12,
    borderTopColor: colors.line,
    borderTopWidth: 1,
    paddingTop: 12,
    color: colors.navyDeep,
    fontSize: 16,
    fontWeight: "700",
  },
  outlineButton: {
    marginTop: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.navy,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 42,
  },
  outlineButtonText: {
    color: colors.navy,
    fontWeight: "600",
  },
  noteInput: {
    marginTop: 10,
    minHeight: 86,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    backgroundColor: colors.white,
    paddingHorizontal: 10,
    paddingVertical: 8,
    textAlignVertical: "top",
    color: colors.text,
  },
  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.cream,
  },
  doneButton: {
    backgroundColor: colors.gold,
    minHeight: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  doneButtonDisabled: {
    opacity: 0.6,
  },
  doneButtonText: {
    color: colors.navyDeep,
    fontWeight: "700",
    fontSize: 15,
  },
});
