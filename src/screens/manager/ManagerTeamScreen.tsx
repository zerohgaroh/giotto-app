import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NavigationProp } from "@react-navigation/native";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ApiError,
  createManagerWaiter,
  deleteManagerWaiter,
  fetchManagerHall,
  fetchManagerWaiters,
  replaceManagerWaiterAssignments,
  resetManagerWaiterPassword,
  updateManagerWaiter,
} from "../../api/client";
import { normalizeManagerPassword, normalizeStaffLogin } from "../../api/staffCredentials";
import type { ManagerStackParamList } from "../../navigation/types";
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

function asFiniteNumber(value: unknown, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function parseApiError(error: unknown, fallback: string) {
  if (!(error instanceof ApiError)) {
    return fallback;
  }
  if (error.status === 401 || error.status === 403) {
    return "Недостаточно прав для этого действия.";
  }
  if (error.status === 409) {
    return "Конфликт данных. Проверь логин и активные назначения столов.";
  }
  if (typeof error.message === "string" && error.message.length > 0 && !error.message.startsWith("HTTP ")) {
    return error.message;
  }
  return fallback;
}

function normalizeWaiter(waiter: ManagerWaiterSummary): ManagerWaiterSummary {
  const raw = waiter as Partial<ManagerWaiterSummary> & { tableIds?: unknown };
  return {
    ...waiter,
    tableIds: Array.isArray(raw.tableIds)
      ? raw.tableIds.map((tableId) => Number(tableId)).filter((tableId) => Number.isFinite(tableId))
      : [],
    assignedTablesCount: asFiniteNumber(raw.assignedTablesCount),
    avgRatingAllTime: asFiniteNumber(raw.avgRatingAllTime),
    reviewsCountAllTime: asFiniteNumber(raw.reviewsCountAllTime),
  };
}

export function ManagerTeamScreen() {
  const navigation = useNavigation<NavigationProp<ManagerStackParamList>>();
  const [waiters, setWaiters] = useState<ManagerWaiterSummary[]>([]);
  const [hall, setHall] = useState<ManagerHallResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [editor, setEditor] = useState<EditorState>(emptyEditor());
  const [editorOpen, setEditorOpen] = useState(false);
  const [passwordResetFor, setPasswordResetFor] = useState<ManagerWaiterSummary | null>(null);
  const [passwordDraft, setPasswordDraft] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [resetPasswordVisible, setResetPasswordVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingWaiterId, setDeletingWaiterId] = useState<string | null>(null);

  const pull = useCallback(async () => {
    const [nextWaiters, nextHall] = await Promise.all([fetchManagerWaiters(), fetchManagerHall()]);
    setWaiters(nextWaiters.map((waiter) => normalizeWaiter(waiter)));
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
    setPasswordVisible(false);
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
    setPasswordVisible(false);
    setEditorOpen(true);
  };

  const openPasswordReset = (waiter: ManagerWaiterSummary) => {
    setPasswordDraft("");
    setResetPasswordVisible(false);
    setPasswordResetFor(waiter);
  };

  const activeTableIds = useMemo(() => hall?.tables.map((table) => table.tableId).sort((a, b) => a - b) ?? [], [hall?.tables]);

  const saveEditor = async () => {
    const name = editor.name.trim();
    const login = normalizeStaffLogin(editor.login);
    const password = normalizeManagerPassword(editor.password);
    if (!name) {
      setErrorText("Введите имя официанта.");
      return;
    }
    if (!login) {
      setErrorText("Введите логин официанта.");
      return;
    }
    if (!/^[a-z0-9._-]{3,40}$/.test(login)) {
      setErrorText("Логин: 3-40 символов, только латиница, цифры, '.', '_' и '-'.");
      return;
    }
    if (!editor.waiterId && password.length < 4) {
      setErrorText("Пароль должен быть не короче 4 символов.");
      return;
    }

    setSaving(true);
    try {
      if (editor.waiterId) {
        await updateManagerWaiter(editor.waiterId, {
          name,
          login,
          active: editor.active,
        });
        await replaceManagerWaiterAssignments(editor.waiterId, editor.tableIds);
      } else {
        await createManagerWaiter({
          name,
          login,
          password,
          tableIds: editor.tableIds,
        });
      }
      await pull();
      setEditorOpen(false);
      setErrorText("");
    } catch (error) {
      setErrorText(parseApiError(error, "Не удалось сохранить."));
    } finally {
      setSaving(false);
    }
  };

  const submitPasswordReset = async () => {
    if (!passwordResetFor) return;
    const password = normalizeManagerPassword(passwordDraft);
    if (password.length < 4) {
      setErrorText("Новый пароль должен быть не короче 4 символов.");
      return;
    }

    setSaving(true);
    try {
      await resetManagerWaiterPassword(passwordResetFor.id, password);
      setPasswordDraft("");
      setPasswordResetFor(null);
      await pull();
      setErrorText("");
    } catch (error) {
      setErrorText(parseApiError(error, "Не удалось сменить пароль."));
    } finally {
      setSaving(false);
    }
  };

  const confirmDeleteWaiter = (waiter: ManagerWaiterSummary) => {
    Alert.alert("Удалить официанта?", `${waiter.name} (${waiter.login})`, [
      { text: "Отмена", style: "cancel" },
      {
        text: "Удалить",
        style: "destructive",
        onPress: () => {
          void (async () => {
            setDeletingWaiterId(waiter.id);
            try {
              await deleteManagerWaiter(waiter.id);
              await pull();
              setErrorText("");
            } catch (error) {
              console.warn("[waiter-delete] client_failed", {
                waiterId: waiter.id,
                status: error instanceof ApiError ? error.status : undefined,
                message: error instanceof Error ? error.message : String(error),
              });
              if (error instanceof ApiError && (error.status === 404 || error.status === 405)) {
                setErrorText("Удаление официанта не поддерживается на сервере. Обновите backend.");
              } else if (error instanceof ApiError && error.status === 409) {
                setErrorText("Сначала убери столы у официанта и закрой активные сессии.");
              } else if (
                error instanceof ApiError &&
                typeof error.message === "string" &&
                error.message.length > 0 &&
                !error.message.startsWith("HTTP ")
              ) {
                setErrorText(error.message);
              } else {
                setErrorText("Не удалось удалить официанта.");
              }
            } finally {
              setDeletingWaiterId(null);
            }
          })();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Команда</Text>
            <Text style={styles.subtitle}>Официанты</Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable
              style={styles.secondaryButton}
              onPress={() => navigation.navigate("ManagerReviews")}
            >
              <Text style={styles.secondaryButtonText}>Отзывы</Text>
            </Pressable>
            <Pressable style={styles.primaryButton} onPress={openCreate}>
              <Text style={styles.primaryButtonText}>Добавить</Text>
            </Pressable>
          </View>
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
            <Text style={styles.cardMeta}>Рейтинг: {waiter.avgRatingAllTime.toFixed(1)} ({waiter.reviewsCountAllTime} отзывов)</Text>

            <View style={styles.actionRow}>
              <Pressable
                style={styles.secondaryButton}
                onPress={() =>
                  navigation.navigate("ManagerReviews", {
                    waiterId: waiter.id,
                    waiterName: waiter.name,
                  })
                }
              >
                <Text style={styles.secondaryButtonText}>Отзывы</Text>
              </Pressable>
              <Pressable style={styles.secondaryButton} onPress={() => openEdit(waiter)}>
                <Text style={styles.secondaryButtonText}>Изменить</Text>
              </Pressable>
              <Pressable style={styles.secondaryButton} onPress={() => openPasswordReset(waiter)}>
                <Text style={styles.secondaryButtonText}>Сменить пароль</Text>
              </Pressable>
              <Pressable
                style={[styles.secondaryButton, styles.dangerButton]}
                onPress={() => confirmDeleteWaiter(waiter)}
                disabled={deletingWaiterId === waiter.id}
              >
                <Text style={[styles.secondaryButtonText, styles.dangerButtonText]}>
                  {deletingWaiterId === waiter.id ? "..." : "Удалить"}
                </Text>
              </Pressable>
            </View>
          </View>
        ))}
      </ScrollView>

      <Modal visible={editorOpen} animationType="slide" onRequestClose={() => setEditorOpen(false)}>
        <SafeAreaView style={styles.modalArea} edges={["top"]}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "padding"}
            keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 18}
            style={styles.flex}
          >
            <ScrollView
              contentContainerStyle={[styles.modalContent, styles.modalContentGrow]}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
            >
              <Text style={styles.modalTitle}>{editor.waiterId ? "Официант" : "Новый официант"}</Text>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Имя</Text>
                <TextInput
                  value={editor.name}
                  onChangeText={(name) => setEditor((current) => ({ ...current, name }))}
                  placeholder="Имя"
                  placeholderTextColor="#8A847A"
                  returnKeyType="next"
                  style={styles.input}
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Логин</Text>
                <TextInput
                  value={editor.login}
                  onChangeText={(login) => setEditor((current) => ({ ...current, login: login.replace(/\s+/g, "").toLowerCase() }))}
                  placeholder="Логин"
                  placeholderTextColor="#8A847A"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType={editor.waiterId ? "done" : "next"}
                  style={styles.input}
                />
              </View>

              {!editor.waiterId ? (
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Пароль</Text>
                  <View style={styles.passwordInputWrap}>
                    <TextInput
                      value={editor.password}
                      onChangeText={(password) => setEditor((current) => ({ ...current, password }))}
                      placeholder="Пароль"
                      placeholderTextColor="#8A847A"
                      secureTextEntry={!passwordVisible}
                      autoCapitalize="none"
                      autoCorrect={false}
                      returnKeyType="done"
                      style={[styles.input, styles.passwordInput]}
                    />
                    <Pressable
                      accessibilityLabel={passwordVisible ? "Скрыть пароль" : "Показать пароль"}
                      hitSlop={10}
                      style={styles.eyeButton}
                      onPress={() => setPasswordVisible((visible) => !visible)}
                    >
                      <Ionicons
                        name={passwordVisible ? "eye-off-outline" : "eye-outline"}
                        size={22}
                        color={colors.navy}
                      />
                    </Pressable>
                  </View>
                </View>
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
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      <Modal visible={!!passwordResetFor} animationType="slide" onRequestClose={() => setPasswordResetFor(null)}>
        <SafeAreaView style={styles.modalArea} edges={["top"]}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "padding"}
            keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 18}
            style={styles.flex}
          >
            <ScrollView
              contentContainerStyle={[styles.modalContent, styles.modalContentGrow]}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
            >
              <Text style={styles.modalTitle}>Новый пароль</Text>
              <Text style={styles.cardMeta}>{passwordResetFor?.name}</Text>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Пароль</Text>
                <View style={styles.passwordInputWrap}>
                  <TextInput
                    value={passwordDraft}
                    onChangeText={setPasswordDraft}
                    placeholder="Пароль"
                    placeholderTextColor="#8A847A"
                    secureTextEntry={!resetPasswordVisible}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="done"
                    style={[styles.input, styles.passwordInput]}
                  />
                  <Pressable
                    accessibilityLabel={resetPasswordVisible ? "Скрыть пароль" : "Показать пароль"}
                    hitSlop={10}
                    style={styles.eyeButton}
                    onPress={() => setResetPasswordVisible((visible) => !visible)}
                  >
                    <Ionicons
                      name={resetPasswordVisible ? "eye-off-outline" : "eye-outline"}
                      size={22}
                      color={colors.navy}
                    />
                  </Pressable>
                </View>
              </View>

              <View style={styles.modalActions}>
                <Pressable style={styles.secondaryButton} onPress={() => setPasswordResetFor(null)}>
                  <Text style={styles.secondaryButtonText}>Отмена</Text>
                </Pressable>
                <Pressable style={styles.primaryButton} onPress={() => void submitPasswordReset()} disabled={saving}>
                  <Text style={styles.primaryButtonText}>{saving ? "..." : "Сохранить"}</Text>
                </Pressable>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
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
  headerActions: {
    flexDirection: "row",
    gap: 8,
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
  dangerButton: {
    borderColor: "#E7C7C7",
    backgroundColor: "#FFF5F5",
  },
  dangerButtonText: {
    color: "#B42318",
  },
  modalArea: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  modalContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 12,
  },
  modalContentGrow: {
    flexGrow: 1,
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
  fieldGroup: {
    gap: 6,
  },
  fieldLabel: {
    color: colors.navyDeep,
    fontSize: 13,
    fontWeight: "700",
  },
  passwordInputWrap: {
    position: "relative",
  },
  passwordInput: {
    paddingRight: 48,
  },
  eyeButton: {
    position: "absolute",
    right: 12,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
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
