import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  createManagerWaiter,
  fetchManagerHall,
  fetchManagerWaiters,
  replaceManagerWaiterAssignments,
  resetManagerWaiterPassword,
  updateManagerWaiter,
} from "../../api/client";
import { useRealtimeRefresh } from "../../realtime/useRealtimeRefresh";
import { colors } from "../../theme/colors";
import type { ManagerHallResponse, ManagerWaiterSummary } from "../../types/domain";

type EditorState = {
  waiterId?: string;
  name: string;
  login: string;
  password: string;
  active: boolean;
  tableIds: number[];
};

function emptyEditor(): EditorState {
  return {
    name: "",
    login: "",
    password: "",
    active: true,
    tableIds: [],
  };
}

export function ManagerTeamScreen() {
  const [waiters, setWaiters] = useState<ManagerWaiterSummary[]>([]);
  const [hall, setHall] = useState<ManagerHallResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [editor, setEditor] = useState<EditorState>(emptyEditor());
  const [editorOpen, setEditorOpen] = useState(false);
  const [passwordResetFor, setPasswordResetFor] = useState<ManagerWaiterSummary | null>(null);
  const [passwordDraft, setPasswordDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const pull = useCallback(async () => {
    const [nextWaiters, nextHall] = await Promise.all([fetchManagerWaiters(), fetchManagerHall()]);
    setWaiters(nextWaiters);
    setHall(nextHall);
  }, []);

  useEffect(() => {
    setLoading(true);
    void (async () => {
      try {
        await pull();
        setErrorText("");
      } catch {
        setErrorText("Не удалось загрузить команду.");
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
      setErrorText("Не удалось обновить список.");
    } finally {
      setRefreshing(false);
    }
  };

  const openCreate = () => {
    setEditor(emptyEditor());
    setEditorOpen(true);
  };

  const openEdit = (waiter: ManagerWaiterSummary) => {
    setEditor({
      waiterId: waiter.id,
      name: waiter.name,
      login: waiter.login,
      password: "",
      active: waiter.active,
      tableIds: waiter.tableIds,
    });
    setEditorOpen(true);
  };

  const activeTableIds = useMemo(() => hall?.tables.map((table) => table.tableId).sort((a, b) => a - b) ?? [], [hall?.tables]);

  const saveEditor = async () => {
    setSaving(true);
    try {
      if (editor.waiterId) {
        await updateManagerWaiter(editor.waiterId, {
          name: editor.name,
          login: editor.login,
          active: editor.active,
        });
        await replaceManagerWaiterAssignments(editor.waiterId, editor.tableIds);
      } else {
        await createManagerWaiter({
          name: editor.name,
          login: editor.login,
          password: editor.password,
          tableIds: editor.tableIds,
        });
      }
      await pull();
      setEditorOpen(false);
      setErrorText("");
    } catch {
      setErrorText("Не удалось сохранить.");
    } finally {
      setSaving(false);
    }
  };

  const submitPasswordReset = async () => {
    if (!passwordResetFor) return;
    setSaving(true);
    try {
      await resetManagerWaiterPassword(passwordResetFor.id, passwordDraft);
      setPasswordDraft("");
      setPasswordResetFor(null);
      await pull();
      setErrorText("");
    } catch {
      setErrorText("Не удалось сменить пароль.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Команда</Text>
            <Text style={styles.subtitle}>Официанты</Text>
          </View>
          <Pressable style={styles.primaryButton} onPress={openCreate}>
            <Text style={styles.primaryButtonText}>Добавить</Text>
          </Pressable>
        </View>

        {loading ? <Text style={styles.meta}>Загрузка...</Text> : null}
        {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}

        {waiters.map((waiter) => (
          <View key={waiter.id} style={styles.card}>
            <View style={styles.rowBetween}>
              <View>
                <Text style={styles.cardTitle}>{waiter.name}</Text>
                <Text style={styles.cardMeta}>Логин: {waiter.login}</Text>
              </View>
              <View style={[styles.statePill, waiter.active ? styles.stateActive : styles.stateInactive]}>
                <Text style={[styles.stateText, waiter.active ? styles.stateTextActive : styles.stateTextInactive]}>
                  {waiter.active ? "Активен" : "Неактивен"}
                </Text>
              </View>
            </View>

            <Text style={styles.cardMeta}>
              Столы: {waiter.tableIds.length > 0 ? waiter.tableIds.join(", ") : "Нет"}
            </Text>
            <Text style={styles.cardMeta}>Назначено: {waiter.assignedTablesCount}</Text>

            <View style={styles.actionRow}>
              <Pressable style={styles.secondaryButton} onPress={() => openEdit(waiter)}>
                <Text style={styles.secondaryButtonText}>Изменить</Text>
              </Pressable>
              <Pressable style={styles.secondaryButton} onPress={() => setPasswordResetFor(waiter)}>
                <Text style={styles.secondaryButtonText}>Сменить пароль</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </ScrollView>

      <Modal visible={editorOpen} animationType="slide" onRequestClose={() => setEditorOpen(false)}>
        <SafeAreaView style={styles.modalArea}>
          <ScrollView contentContainerStyle={styles.modalContent}>
            <Text style={styles.modalTitle}>{editor.waiterId ? "Официант" : "Новый официант"}</Text>
            <TextInput
              value={editor.name}
              onChangeText={(name) => setEditor((current) => ({ ...current, name }))}
              placeholder="Имя"
              style={styles.input}
            />
            <TextInput
              value={editor.login}
              onChangeText={(login) => setEditor((current) => ({ ...current, login }))}
              placeholder="Логин"
              autoCapitalize="none"
              style={styles.input}
            />
            {!editor.waiterId ? (
              <TextInput
                value={editor.password}
                onChangeText={(password) => setEditor((current) => ({ ...current, password }))}
                placeholder="Пароль"
                secureTextEntry
                style={styles.input}
              />
            ) : null}

            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Аккаунт активен</Text>
              <Switch
                value={editor.active}
                onValueChange={(active) => setEditor((current) => ({ ...current, active }))}
              />
            </View>

            <Text style={styles.sectionLabel}>Столы</Text>
            <View style={styles.tableChips}>
              {activeTableIds.map((tableId) => {
                const selected = editor.tableIds.includes(tableId);
                return (
                  <Pressable
                    key={tableId}
                    style={[styles.tableChip, selected && styles.tableChipActive]}
                    onPress={() =>
                      setEditor((current) => ({
                        ...current,
                        tableIds: selected
                          ? current.tableIds.filter((candidate) => candidate !== tableId)
                          : [...current.tableIds, tableId].sort((a, b) => a - b),
                      }))
                    }
                  >
                    <Text style={[styles.tableChipText, selected && styles.tableChipTextActive]}>#{tableId}</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.modalActions}>
              <Pressable style={styles.secondaryButton} onPress={() => setEditorOpen(false)}>
                <Text style={styles.secondaryButtonText}>Отмена</Text>
              </Pressable>
              <Pressable style={styles.primaryButton} onPress={() => void saveEditor()} disabled={saving}>
                <Text style={styles.primaryButtonText}>{saving ? "..." : "Сохранить"}</Text>
              </Pressable>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <Modal visible={!!passwordResetFor} animationType="slide" onRequestClose={() => setPasswordResetFor(null)}>
        <SafeAreaView style={styles.modalArea}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Новый пароль</Text>
            <Text style={styles.cardMeta}>{passwordResetFor?.name}</Text>
            <TextInput
              value={passwordDraft}
              onChangeText={setPasswordDraft}
              placeholder="Пароль"
              secureTextEntry
              style={styles.input}
            />
            <View style={styles.modalActions}>
              <Pressable style={styles.secondaryButton} onPress={() => setPasswordResetFor(null)}>
                <Text style={styles.secondaryButtonText}>Отмена</Text>
              </Pressable>
              <Pressable style={styles.primaryButton} onPress={() => void submitPasswordReset()} disabled={saving}>
                <Text style={styles.primaryButtonText}>{saving ? "..." : "Сохранить"}</Text>
              </Pressable>
            </View>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  content: {
    padding: 16,
    gap: 12,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
  },
  title: {
    fontSize: 30,
    fontWeight: "700",
    color: colors.navyDeep,
  },
  subtitle: {
    marginTop: 4,
    color: colors.muted,
    fontSize: 13,
  },
  meta: {
    color: colors.muted,
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
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  cardTitle: {
    color: colors.navyDeep,
    fontWeight: "800",
    fontSize: 18,
  },
  cardMeta: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  statePill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: "flex-start",
  },
  stateActive: {
    backgroundColor: "#EAF3DE",
  },
  stateInactive: {
    backgroundColor: "#F4E4E4",
  },
  stateText: {
    fontSize: 11,
    fontWeight: "700",
  },
  stateTextActive: {
    color: "#2D6A4F",
  },
  stateTextInactive: {
    color: "#9D1C1C",
  },
  actionRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  primaryButton: {
    minHeight: 42,
    borderRadius: 14,
    backgroundColor: colors.navy,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  primaryButtonText: {
    color: colors.white,
    fontWeight: "700",
  },
  secondaryButton: {
    minHeight: 42,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  secondaryButtonText: {
    color: colors.navy,
    fontWeight: "600",
  },
  modalArea: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  modalContent: {
    padding: 16,
    gap: 12,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.navyDeep,
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
  },
  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  switchLabel: {
    color: colors.navyDeep,
    fontWeight: "600",
  },
  sectionLabel: {
    color: colors.navyDeep,
    fontWeight: "700",
  },
  tableChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  tableChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  tableChipActive: {
    borderColor: colors.navy,
    backgroundColor: colors.navy,
  },
  tableChipText: {
    color: colors.navy,
    fontWeight: "600",
  },
  tableChipTextActive: {
    color: colors.white,
  },
  modalActions: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "flex-end",
  },
});
