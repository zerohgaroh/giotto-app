import Constants from "expo-constants";
import * as Device from "expo-device";
let Notifications: typeof import("expo-notifications");
import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  AppState,
  type AppStateStatus,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  Vibration,
  View,
} from "react-native";
import { registerPushToken } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { openWaiterQueueForTable, openWaiterTable } from "../navigation/navigationRef";
import { useWaiterRealtime } from "../realtime/useWaiterRealtime";
import { colors } from "../theme/colors";
import type { PushDeviceRegistration } from "../types/domain";
import { createIncomingServiceAlert, createIncomingServiceAlertFromRealtime, type IncomingServiceAlert } from "./incomingServiceAlerts";

const DEVICE_ID_KEY = "giotto.mobile.deviceId.v1";
const ALERT_DEDUPE_MS = 6_000;
const ALERT_VISIBLE_MS = 4_500;
const PUSH_RESYNC_INTERVAL_MS = 60_000;
const VIBRATION_PATTERN = Platform.OS === "android" ? [0, 180, 120, 220] : 350;
const NOTIFICATION_CHANNEL_ID = "giotto-service-alerts";
const FOREGROUND_SIGNAL_FLAG = "__giottoForegroundSignal";

const isExpoGo = Constants.appOwnership === "expo";

async function setupNotifications(appStateRef: { current: AppStateStatus }) {
  if (isExpoGo) return;
  if (!Notifications) {
    Notifications = await import("expo-notifications");
  }

  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const isActive = appStateRef.current === "active";
      const isForegroundSignal = notification.request.content.data?.[FOREGROUND_SIGNAL_FLAG] === true;
      return {
        shouldShowAlert: !isActive || isForegroundSignal,
        shouldPlaySound: !isActive || isForegroundSignal,
        shouldSetBadge: false,
        shouldShowBanner: !isActive || isForegroundSignal,
        shouldShowList: !isActive || isForegroundSignal,
      };
    },
  });
}

async function getOrCreateDeviceId() {
  const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (existing) return existing;

  const created = `${Platform.OS}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  await SecureStore.setItemAsync(DEVICE_ID_KEY, created);
  return created;
}

function extractTableId(input: unknown) {
  const value = Number(input);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.floor(value);
}

async function registerForPush(): Promise<PushDeviceRegistration | null> {
  if (!Device.isDevice || isExpoGo) return null;
  if (!Notifications) {
    Notifications = await import("expo-notifications");
  }

  const permission = await Notifications.getPermissionsAsync();
  let granted =
    typeof (permission as { granted?: unknown }).granted === "boolean"
      ? Boolean((permission as { granted?: boolean }).granted)
      : (permission as { status?: string }).status === "granted";

  if (!granted) {
    const request = await Notifications.requestPermissionsAsync();
    granted =
      typeof (request as { granted?: unknown }).granted === "boolean"
        ? Boolean((request as { granted?: boolean }).granted)
        : (request as { status?: string }).status === "granted";
  }

  if (!granted) return null;

  const projectId =
    Constants.easConfig?.projectId ??
    (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
  const tokenResponse = projectId
    ? await Notifications.getExpoPushTokenAsync({ projectId })
    : await Notifications.getExpoPushTokenAsync();

  return {
    token: tokenResponse.data,
    platform: "expo",
    appVersion: Constants.expoConfig?.version ?? "1.0.0",
    deviceId: await getOrCreateDeviceId(),
  };
}

function maybeOpenTableFromData(data: Record<string, unknown> | undefined) {
  const tableId = extractTableId(data?.tableId);
  if (!tableId) return;

  const requestType = typeof data?.requestType === "string" ? data.requestType : undefined;
  if (requestType === "waiter" || requestType === "bill") {
    openWaiterQueueForTable(tableId);
    return;
  }

  openWaiterTable(tableId);
}

export function StaffRuntime() {
  const { session } = useAuth();
  const [alertQueue, setAlertQueue] = useState<IncomingServiceAlert[]>([]);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const lastSeenAtRef = useRef(new Map<string, number>());
  const lastPushSyncAtRef = useRef(0);
  const dismissingRef = useRef(false);
  const animation = useRef(new Animated.Value(0)).current;
  const currentAlert = alertQueue[0] ?? null;
  const isWaiterSession = session?.role === "waiter";

  if (isExpoGo) {
    return null;
  }

  const pruneSeenAlerts = useCallback((now: number) => {
    for (const [key, seenAt] of lastSeenAtRef.current.entries()) {
      if (now - seenAt > ALERT_DEDUPE_MS * 3) {
        lastSeenAtRef.current.delete(key);
      }
    }
  }, []);

  const playForegroundSignal = useCallback(async (alert: IncomingServiceAlert) => {
    Vibration.vibrate(VIBRATION_PATTERN);

    try {
      if (!Notifications) Notifications = await import("expo-notifications");
      await Notifications.scheduleNotificationAsync({
        content: {
          title: alert.title,
          body: alert.message,
          sound: "default",
          data: {
            [FOREGROUND_SIGNAL_FLAG]: true,
            tableId: alert.tableId,
            requestType: alert.requestType,
          },
          ...(Platform.OS === "android" ? { channelId: NOTIFICATION_CHANNEL_ID } : {}),
        },
        trigger: null,
      });
    } catch {
      // Sound should be best-effort only.
    }
  }, []);

  const dismissCurrentAlert = useCallback(() => {
    if (!currentAlert || dismissingRef.current) return;

    dismissingRef.current = true;
    Animated.timing(animation, {
      toValue: 0,
      duration: 170,
      useNativeDriver: true,
    }).start(() => {
      setAlertQueue((current) => current.slice(1));
      dismissingRef.current = false;
    });
  }, [animation, currentAlert]);

  const enqueueIncomingAlert = useCallback(
    (alert: IncomingServiceAlert | null, options?: { playSignal?: boolean }) => {
      if (!alert || !isWaiterSession || appStateRef.current !== "active") {
        return;
      }

      const now = Date.now();
      pruneSeenAlerts(now);
      const lastSeenAt = lastSeenAtRef.current.get(alert.dedupeKey) ?? 0;
      if (now - lastSeenAt < ALERT_DEDUPE_MS) {
        return;
      }

      lastSeenAtRef.current.set(alert.dedupeKey, now);
      setAlertQueue((current) => [...current, alert]);

      if (options?.playSignal !== false) {
        void playForegroundSignal(alert);
      }
    },
    [isWaiterSession, playForegroundSignal, pruneSeenAlerts],
  );

  const handleRuntimeRealtimeEvent = useCallback(
    (event: Parameters<typeof createIncomingServiceAlertFromRealtime>[0]) => {
      enqueueIncomingAlert(createIncomingServiceAlertFromRealtime(event));
    },
    [enqueueIncomingAlert],
  );

  useWaiterRealtime(handleRuntimeRealtimeEvent);

  const syncPushToken = useCallback(async () => {
    if (!session || session.role !== "waiter") return;

    const now = Date.now();
    if (now - lastPushSyncAtRef.current < PUSH_RESYNC_INTERVAL_MS) {
      return;
    }
    lastPushSyncAtRef.current = now;

    try {
      const payload = await registerForPush();
      if (!payload) return;
      await registerPushToken(payload);
    } catch {
      // Push registration should not block the waiter session.
    }
  }, [session]);

  const popupTransform = useMemo(
    () => [
      {
        translateY: animation.interpolate({
          inputRange: [0, 1],
          outputRange: [-18, 0],
        }),
      },
    ],
    [animation],
  );

  useEffect(() => {
    void setupNotifications(appStateRef);

    if (Platform.OS === "android") {
      void (async () => {
        if (!Notifications) Notifications = await import("expo-notifications");
        await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNEL_ID, {
          name: "Giotto service alerts",
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 180, 120, 220],
          enableVibrate: true,
          sound: "default",
          bypassDnd: false,
          showBadge: true,
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        });
      })();
    }
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      appStateRef.current = nextState;
      if (nextState === "active") {
        void syncPushToken();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [syncPushToken]);

  useEffect(() => {
    let cancelled = false;
    let responseSubscription: { remove(): void } | null = null;
    let receivedSubscription: { remove(): void } | null = null;

    void (async () => {
      if (!Notifications) Notifications = await import("expo-notifications");
      if (cancelled) return;

      responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
        maybeOpenTableFromData(response.notification.request.content.data as Record<string, unknown>);
      });

      receivedSubscription = Notifications.addNotificationReceivedListener((notification) => {
        enqueueIncomingAlert(
          createIncomingServiceAlert({
            id: notification.request.identifier,
            tableId: notification.request.content.data?.tableId,
            requestType: notification.request.content.data?.requestType,
            reason: notification.request.content.body,
            ts: Date.now(),
          }),
          { playSignal: true },
        );
      });

      void Notifications.getLastNotificationResponseAsync().then((response) => {
        if (!response) return;
        maybeOpenTableFromData(response.notification.request.content.data as Record<string, unknown>);
      });
    })();

    return () => {
      cancelled = true;
      responseSubscription?.remove();
      receivedSubscription?.remove();
    };
  }, [enqueueIncomingAlert]);

  useEffect(() => {
    void syncPushToken();
  }, [syncPushToken]);

  useEffect(() => {
    if (!currentAlert) {
      animation.setValue(0);
      return;
    }

    Animated.spring(animation, {
      toValue: 1,
      damping: 16,
      stiffness: 220,
      mass: 0.9,
      useNativeDriver: true,
    }).start();

    const timer = setTimeout(() => {
      dismissCurrentAlert();
    }, ALERT_VISIBLE_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [animation, currentAlert, dismissCurrentAlert]);

  if (!currentAlert) {
    return null;
  }

  return (
    <SafeAreaView pointerEvents="box-none" style={styles.overlay}>
      <Animated.View
        style={[
          styles.alertCard,
          {
            opacity: animation,
            transform: popupTransform,
          },
        ]}
      >
        <Pressable
          style={styles.alertPressable}
          onPress={() => {
            openWaiterQueueForTable(currentAlert.tableId);
            dismissCurrentAlert();
          }}
        >
          <View style={styles.alertCopy}>
            <Text style={styles.alertEyebrow}>{currentAlert.requestType === "bill" ? "Счёт" : "Новый вызов"}</Text>
            <Text style={styles.alertTitle}>{currentAlert.title}</Text>
            <Text style={styles.alertMessage} numberOfLines={2}>
              {currentAlert.message}
            </Text>
          </View>
          <View style={styles.alertActions}>
            <Text style={styles.alertTable}>#{currentAlert.tableId}</Text>
            <Text style={styles.alertHint}>Открыть</Text>
          </View>
        </Pressable>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    pointerEvents: "box-none",
  },
  alertCard: {
    marginHorizontal: 12,
    marginTop: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E8D6B5",
    backgroundColor: "rgba(255, 249, 239, 0.98)",
    shadowColor: colors.navyDeep,
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 7,
  },
  alertPressable: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  alertCopy: {
    flex: 1,
    gap: 3,
  },
  alertEyebrow: {
    color: "#8A6A33",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  alertTitle: {
    color: colors.navyDeep,
    fontSize: 15,
    fontWeight: "800",
  },
  alertMessage: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
  },
  alertActions: {
    alignItems: "flex-end",
    gap: 4,
  },
  alertTable: {
    minWidth: 42,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.gold,
    color: colors.navyDeep,
    fontSize: 12,
    fontWeight: "800",
    textAlign: "center",
  },
  alertHint: {
    color: colors.navy,
    fontSize: 12,
    fontWeight: "700",
  },
});
