import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  ackWaiterRequest,
  ackWaiterTask,
  completeWaiterTask,
  createWaiterFollowUp,
  doneWaiter,
  fetchWaiterShortcuts,
  fetchWaiterTable,
  repeatLastWaiterOrder,
  setTableNote,
  startWaiterTask,
} from "../../api/client";
import { StatusBadge } from "../../components/StatusBadge";
import type { WaiterStackParamList } from "../../navigation/types";
import { useWaiterRealtime } from "../../realtime/useWaiterRealtime";
import { clearNoteDraft, createMutationKey, loadNoteDraft, saveNoteDraft } from "../../runtime/waiterDrafts";
import { colors } from "../../theme/colors";
import { formatDurationFrom, formatPrice, formatTime } from "../../theme/format";
import type { RealtimeEvent, WaiterShortcuts, WaiterTableDetailResponse, WaiterTask, WaiterTableTimelineEntry } from "../../types/domain";
import { shouldExitWaiterTableFlow } from "./waiterAccessGuard";

type Props = NativeStackScreenProps<WaiterStackParamList, "WaiterTable">;

function timelineLabel(entry: WaiterTableTimelineEntry) {
  switch (entry.type) {
    case "waiter:called":
      return "Вызов официанта";
    case "bill:requested":
      return "Запросили счёт";
    case "waiter:acknowledged":
      return "Запрос принят";
    case "order:added_by_waiter":
      return "Добавлены позиции";
    case "waiter:done":
      return "Обслуживание завершено";
    case "table:assignment_changed":
      return "Сменили официанта";
    case "table:status_changed":
      return "Изменился статус";
    case "task:created":
      return "Создали задачу";
    case "task:updated":
      return "Обновили задачу";
    case "task:completed":
      return "Задача закрыта";
    case "review:submitted":
      return "Оставили отзыв";
    default:
      return entry.type;
  }
}

function taskStatusText(task: WaiterTask) {
  if (task.status === "acknowledged") return "Принято";
  if (task.status === "in_progress") return "В работе";
  if (task.status === "completed") return "Готово";
  if (task.status === "cancelled") return "Отменено";
  return "Новое";
}

function taskTypeText(task: WaiterTask) {
  if (task.type === "bill_request") return "Счёт";
  if (task.type === "follow_up") return "Напоминание";
  return "Официант";
}

function taskBadgeStatus(task: WaiterTask): "bill" | "waiting" | "occupied" {
  if (task.type === "bill_request") return "bill";
  if (task.priority === "urgent") return "waiting";
  return "occupied";
}

export function WaiterTableScreen({ navigation, route }: Props) {
  const tableId = route.params.tableId;
  const [data, setData] = useState<WaiterTableDetailResponse | null>(null);
  const [shortcuts, setShortcuts] = useState<WaiterShortcuts | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [lastSyncedNote, setLastSyncedNote] = useState("");
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [now, setNow] = useState(Date.now());
  const [followUpTitle, setFollowUpTitle] = useState("");
  const [followUpDueMin, setFollowUpDueMin] = useState("5");
  const [taskBusyId, setTaskBusyId] = useState<string | null>(null);
  const [repeatBusy, setRepeatBusy] = useState(false);
  const [creatingFollowUp, setCreatingFollowUp] = useState(false);

  const applyDetail = useCallback(
    async (next: WaiterTableDetailResponse, options?: { useStoredDraft?: boolean }) => {
      setData(next);
      setLastSyncedNote(next.note || "");

      if (options?.useStoredDraft) {
        const storedDraft = await loadNoteDraft(tableId);
        setNoteDraft(storedDraft && storedDraft !== next.note ? storedDraft : next.note || "");
        setDraftHydrated(true);
        return;
      }

      setNoteDraft((current) => {
        if (!draftHydrated || current === lastSyncedNote) {
          return next.note || "";
        }
        return current;
      });
    },
    [draftHydrated, lastSyncedNote, tableId],
  );

  const pull = useCallback(
    async (withLoader = false, useStoredDraft = false) => {
      if (withLoader) setLoading(true);
      try {
        const [next, nextShortcuts] = await Promise.all([fetchWaiterTable(tableId), fetchWaiterShortcuts()]);
        await applyDetail(next, { useStoredDraft });
        setShortcuts(nextShortcuts);
        setErrorText("");
      } catch (error) {
        if (shouldExitWaiterTableFlow(error)) {
          navigation.goBack();
          return;
        }
        setErrorText("Не удалось загрузить стол.");
      } finally {
        if (withLoader) setLoading(false);
      }
    },
    [applyDetail, navigation, tableId],
  );

  const handleRealtimeEvent = useCallback(
    (event: RealtimeEvent) => {
      if (event.tableId !== tableId) return;
      void pull(false, false);
    },
    [pull, tableId],
  );

  const { connected } = useWaiterRealtime(handleRealtimeEvent);

  useEffect(() => {
    void pull(true, true);
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [pull]);

  useEffect(() => {
    if (!draftHydrated) return;
    if (noteDraft === lastSyncedNote) {
      void clearNoteDraft(tableId);
      return;
    }
    void saveNoteDraft(tableId, noteDraft);
  }, [draftHydrated, lastSyncedNote, noteDraft, tableId]);

  useEffect(() => {
    if (!data || !draftHydrated) return;
    if (noteDraft === lastSyncedNote) return;

    const id = setTimeout(() => {
      void (async () => {
        setSavingNote(true);
        try {
          const next = await setTableNote(tableId, noteDraft);
          await applyDetail(next);
          await clearNoteDraft(tableId);
          setErrorText("");
        } catch (error) {
          if (shouldExitWaiterTableFlow(error)) {
            navigation.goBack();
            return;
          }
          setErrorText("Не удалось сохранить заметку.");
        } finally {
          setSavingNote(false);
        }
      })();
    }, 700);

    return () => clearTimeout(id);
  }, [applyDetail, data, draftHydrated, lastSyncedNote, navigation, noteDraft, tableId]);

  const onRefresh = async () => {
    setRefreshing(true);
    await pull(false, false);
    setRefreshing(false);
  };

  const doneCooldownLeft = useMemo(() => {
    if (!data?.table.doneCooldownUntil) return 0;
    return Math.max(0, data.table.doneCooldownUntil - now);
  }, [data?.table.doneCooldownUntil, now]);

  const total = useMemo(
    () => (data?.billLines || []).reduce((sum, line) => sum + line.qty * line.price, 0),
    [data?.billLines],
  );

  const onAckRequest = async (requestId: string) => {
    try {
      const next = await ackWaiterRequest(tableId, requestId);
      await applyDetail(next);
      setErrorText("");
    } catch (error) {
      if (shouldExitWaiterTableFlow(error)) {
        navigation.goBack();
        return;
      }
      setErrorText("Не удалось принять запрос.");
    }
  };

  const onTaskAction = async (task: WaiterTask, action: "ack" | "start" | "complete") => {
    setTaskBusyId(task.id);
    try {
      const next =
        action === "ack"
          ? await ackWaiterTask(task.id)
          : action === "start"
            ? await startWaiterTask(task.id)
            : await completeWaiterTask(task.id, createMutationKey("task-complete"));
      await applyDetail(next);
      setErrorText("");
    } catch (error) {
      if (shouldExitWaiterTableFlow(error)) {
        navigation.goBack();
        return;
      }
      setErrorText("Не удалось обновить задачу.");
    } finally {
      setTaskBusyId(null);
    }
  };

  const onRepeatLast = async () => {
    setRepeatBusy(true);
    try {
      const next = await repeatLastWaiterOrder(tableId, { mutationKey: createMutationKey("repeat-order") });
      await applyDetail(next);
      setErrorText("");
    } catch (error) {
      if (shouldExitWaiterTableFlow(error)) {
        navigation.goBack();
        return;
      }
      setErrorText("Не удалось повторить заказ.");
    } finally {
      setRepeatBusy(false);
    }
  };

  const onCreateFollowUp = async () => {
    const trimmed = followUpTitle.trim();
    if (!trimmed) return;

    setCreatingFollowUp(true);
    try {
      const dueInMin = Number.parseInt(followUpDueMin, 10);
      const next = await createWaiterFollowUp(tableId, {
        title: trimmed,
        dueInMin: Number.isFinite(dueInMin) && dueInMin > 0 ? dueInMin : undefined,
        note: noteDraft.trim() || undefined,
      });
      await applyDetail(next);
      setFollowUpTitle("");
      setFollowUpDueMin("5");
      setErrorText("");
    } catch (error) {
      if (shouldExitWaiterTableFlow(error)) {
        navigation.goBack();
        return;
      }
      setErrorText("Не удалось создать задачу.");
    } finally {
      setCreatingFollowUp(false);
    }
  };

  const onDone = async () => {
    try {
      const next = await doneWaiter(tableId);
      await applyDetail(next);
      setErrorText("");
    } catch (error) {
      if (shouldExitWaiterTableFlow(error)) {
        navigation.goBack();
        return;
      }
      setErrorText("Не удалось завершить обслуживание.");
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
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.topBar}>
          <Pressable style={styles.navButton} onPress={() => navigation.goBack()}>
            <Text style={styles.navButtonText}>Назад</Text>
          </Pressable>
          <Pressable style={styles.navButton} onPress={() => void onRefresh()}>
            <Text style={styles.navButtonText}>Обновить</Text>
          </Pressable>
        </View>

        <View style={styles.headerRow}>
          <View>
            <Text style={styles.tableLabel}>Стол {tableId}</Text>
            <Text style={styles.timeSpent}>За столом {formatDurationFrom(data.table.guestStartedAt, now)}</Text>
          </View>
          <StatusBadge status={data.table.status} />
        </View>

        {!connected ? <View style={styles.banner}><Text style={styles.bannerText}>Нет связи.</Text></View> : null}

        {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}

        {(data.requests || []).map((request) => (
          <View key={request.id} style={styles.alertCard}>
            <Text style={styles.alertTitle}>{request.type === "bill" ? "Запросили счёт" : "Вызвали официанта"}</Text>
            <Text style={styles.alertSub}>{request.reason}</Text>
            <Text style={styles.alertSub}>{formatTime(request.createdAt)}</Text>
            <Pressable style={styles.goldButton} onPress={() => void onAckRequest(request.id)}>
              <Text style={styles.goldButtonText}>Принять</Text>
            </Pressable>
          </View>
        ))}

        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>Задачи</Text>
            <Text style={styles.metaBadge}>{data.tasks.length}</Text>
          </View>
          {data.tasks.length === 0 ? (
            <Text style={styles.emptyText}>Задач нет.</Text>
          ) : (
            <View style={styles.stack}>
              {data.tasks.map((task) => {
                const busy = taskBusyId === task.id;
                return (
                  <View key={task.id} style={styles.taskCard}>
                    <View style={styles.cardHeaderRow}>
                      <View style={styles.flexOne}>
                        <Text style={styles.taskTitle}>{task.title}</Text>
                        <Text style={styles.taskMeta}>
                          {taskTypeText(task)} · {taskStatusText(task)}
                        </Text>
                      </View>
                      <StatusBadge status={taskBadgeStatus(task)} />
                    </View>
                    {task.subtitle ? <Text style={styles.taskNote}>{task.subtitle}</Text> : null}
                    {task.note ? <Text style={styles.taskNote}>Заметка: {task.note}</Text> : null}
                    <Text style={styles.taskMeta}>С {formatTime(task.createdAt)}</Text>
                    {task.dueAt ? <Text style={styles.taskMeta}>До {formatTime(task.dueAt)}</Text> : null}

                    <View style={styles.inlineActions}>
                      {task.status === "open" ? (
                        <Pressable
                          style={[styles.smallOutlineButton, busy && styles.buttonDisabled]}
                          disabled={busy}
                          onPress={() => void onTaskAction(task, "ack")}
                        >
                          <Text style={styles.smallOutlineButtonText}>{busy ? "..." : "Принять"}</Text>
                        </Pressable>
                      ) : null}
                      {(task.status === "open" || task.status === "acknowledged") && (
                        <Pressable
                          style={[styles.smallOutlineButton, busy && styles.buttonDisabled]}
                          disabled={busy}
                          onPress={() => void onTaskAction(task, "start")}
                        >
                          <Text style={styles.smallOutlineButtonText}>{busy ? "..." : "Начать"}</Text>
                        </Pressable>
                      )}
                      {task.status !== "completed" && task.status !== "cancelled" ? (
                        <Pressable
                          style={[styles.smallGoldButton, busy && styles.buttonDisabled]}
                          disabled={busy}
                          onPress={() => void onTaskAction(task, "complete")}
                        >
                          <Text style={styles.smallGoldButtonText}>{busy ? "..." : "Готово"}</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Счёт</Text>
          {(data.billLines || []).length === 0 ? (
            <Text style={styles.emptyText}>Пока пусто.</Text>
          ) : (
            <View style={styles.linesList}>
              {data.billLines.map((line) => (
                <View key={line.id} style={styles.lineRow}>
                  <View style={styles.lineCopy}>
                    <Text style={styles.lineTitle}>
                      {line.title} x {line.qty}
                    </Text>
                    {line.note ? <Text style={styles.lineNote}>Заметка: {line.note}</Text> : null}
                    <Text style={styles.lineSource}>{line.source === "guest" ? "Гость" : "Официант"}</Text>
                  </View>
                  <Text style={styles.lineAmount}>{formatPrice(line.qty * line.price)}</Text>
                </View>
              ))}
            </View>
          )}
          <Text style={styles.total}>Итого: {formatPrice(total)}</Text>

          <View style={styles.inlineActions}>
            <Pressable style={styles.outlineButton} onPress={() => navigation.navigate("WaiterAddOrder", { tableId })}>
              <Text style={styles.outlineButtonText}>Добавить</Text>
            </Pressable>
            <Pressable
              style={[styles.secondaryActionButton, repeatBusy && styles.buttonDisabled]}
              disabled={repeatBusy}
              onPress={() => void onRepeatLast()}
            >
              <Text style={styles.secondaryActionButtonText}>{repeatBusy ? "..." : "Повторить"}</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Заметка</Text>
          <TextInput
            value={noteDraft}
            onChangeText={setNoteDraft}
            multiline
            placeholder="Заметка"
            style={styles.noteInput}
            placeholderTextColor="#8A847A"
          />
          {shortcuts?.noteTemplates?.length ? (
            <View style={styles.inlineActions}>
              {shortcuts.noteTemplates.map((template) => (
                <Pressable key={template} style={styles.templateChip} onPress={() => setNoteDraft(template)}>
                  <Text style={styles.templateChipText}>{template}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          <Text style={styles.helperText}>
            {savingNote ? "Сохраняется" : noteDraft === lastSyncedNote ? "Сохранено" : "Черновик"}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Напоминание</Text>
          <TextInput
            value={followUpTitle}
            onChangeText={setFollowUpTitle}
            placeholder="Что сделать"
            placeholderTextColor="#8A847A"
            style={styles.fieldInput}
          />
          <TextInput
            value={followUpDueMin}
            onChangeText={setFollowUpDueMin}
            keyboardType="number-pad"
            placeholder="Через сколько минут"
            placeholderTextColor="#8A847A"
            style={styles.fieldInput}
          />
          <Pressable
            style={[styles.outlineButton, creatingFollowUp && styles.buttonDisabled]}
            disabled={creatingFollowUp || !followUpTitle.trim()}
            onPress={() => void onCreateFollowUp()}
          >
            <Text style={styles.outlineButtonText}>{creatingFollowUp ? "..." : "Создать"}</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>История</Text>
          {data.timeline.length === 0 ? (
            <Text style={styles.emptyText}>Пока пусто.</Text>
          ) : (
            <View style={styles.stack}>
              {data.timeline.map((entry) => (
                <View key={entry.id} style={styles.timelineRow}>
                  <Text style={styles.timelineTitle}>{timelineLabel(entry)}</Text>
                  <Text style={styles.timelineMeta}>
                    {formatTime(entry.ts)} · {entry.actorRole}
                    {entry.actorId ? ` (${entry.actorId})` : ""}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {data.reviewPrompt ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Отзыв</Text>
            <Text style={styles.helperText}>До {formatTime(data.reviewPrompt.expiresAt)}</Text>
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.bottomBar}>
        <Pressable
          disabled={doneCooldownLeft > 0}
          style={[styles.doneButton, doneCooldownLeft > 0 && styles.doneButtonDisabled]}
          onPress={() => void onDone()}
        >
          <Text style={styles.doneButtonText}>
            {doneCooldownLeft > 0 ? `Через ${Math.ceil(doneCooldownLeft / 1000)}с` : "Всё обслужил"}
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
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  navButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  navButtonText: {
    color: colors.navy,
    fontWeight: "600",
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
    gap: 10,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  cardTitle: {
    color: colors.navyDeep,
    fontSize: 18,
    fontWeight: "700",
  },
  metaBadge: {
    color: "#8A6A33",
    fontSize: 11,
    fontWeight: "700",
    backgroundColor: "#FFF8EC",
    borderWidth: 1,
    borderColor: "#E8D6B5",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  emptyText: {
    color: colors.muted,
  },
  stack: {
    gap: 8,
  },
  taskCard: {
    borderRadius: 12,
    backgroundColor: colors.cream,
    padding: 10,
    gap: 6,
  },
  flexOne: {
    flex: 1,
  },
  taskTitle: {
    color: colors.navyDeep,
    fontWeight: "700",
  },
  taskMeta: {
    color: colors.muted,
    fontSize: 12,
  },
  taskNote: {
    color: colors.text,
    fontSize: 13,
  },
  inlineActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  smallOutlineButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.navy,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: colors.white,
  },
  smallOutlineButtonText: {
    color: colors.navy,
    fontWeight: "600",
    fontSize: 12,
  },
  smallGoldButton: {
    borderRadius: 999,
    backgroundColor: colors.gold,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  smallGoldButtonText: {
    color: colors.navyDeep,
    fontWeight: "700",
    fontSize: 12,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  linesList: {
    gap: 10,
  },
  lineRow: {
    flexDirection: "row",
    gap: 8,
  },
  lineCopy: {
    flex: 1,
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
    borderTopColor: colors.line,
    borderTopWidth: 1,
    paddingTop: 12,
    color: colors.navyDeep,
    fontSize: 16,
    fontWeight: "700",
  },
  outlineButton: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.navy,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 42,
    backgroundColor: colors.white,
  },
  outlineButtonText: {
    color: colors.navy,
    fontWeight: "600",
  },
  secondaryActionButton: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.cream,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 42,
  },
  secondaryActionButtonText: {
    color: colors.navy,
    fontWeight: "600",
  },
  noteInput: {
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
  fieldInput: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    backgroundColor: colors.white,
    paddingHorizontal: 12,
    color: colors.text,
  },
  templateChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  templateChipText: {
    color: colors.navy,
    fontSize: 12,
    fontWeight: "600",
  },
  helperText: {
    color: colors.muted,
    fontSize: 12,
  },
  timelineRow: {
    borderLeftWidth: 2,
    borderLeftColor: colors.gold,
    paddingLeft: 10,
    gap: 2,
  },
  timelineTitle: {
    color: colors.navyDeep,
    fontWeight: "600",
  },
  timelineMeta: {
    color: colors.muted,
    fontSize: 12,
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
