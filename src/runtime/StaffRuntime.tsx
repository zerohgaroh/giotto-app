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
import {
  createAndroidPushRegistration,
  createExpoPushRegistration,
  getAndroidNotificationChannelInput,
  NOTIFICATION_CHANNEL_ID,
} from "./pushRegistration";

const DEVICE_ID_KEY = "giotto.mobile.deviceId.v1";
const ALERT_DEDUPE_MS = 6_000;
const ALERT_VISIBLE_MS = 4_500;
const PUSH_RESYNC_INTERVAL_MS = 60_000;
const PUSH_SYNC_MAX_ATTEMPTS = 3;
const PUSH_SYNC_RETRY_DELAYS_MS = [900, 2_100];
const PUSH_MAX_AGE_MS = 90_000;
const VIBRATION_PATTERN = Platform.OS === "android" ? [0, 180, 120, 220] : 350;
const pushDebugEnabled = __DEV__ || process.env.EXPO_PUBLIC_PUSH_DEBUG === "1";

const isExpoGo = Constants.appOwnership === "expo";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function previewPushToken(token: string) {
  if (!token) return "(empty)";
  if (token.length <= 22) return token;
  return `${token.slice(0, 14)}...${token.slice(-8)}`;
}

function extractTraceId(data: Record<string, unknown> | undefined) {
  return typeof data?.traceId === "string" && data.traceId.trim() ? data.traceId.trim() : undefined;
}

function extractPushSentAt(data: Record<string, unknown> | undefined) {
  const raw =
    typeof data?.sentAt === "string" || typeof data?.sentAt === "number"
      ? Number(data.sentAt)
      : typeof data?.ts === "string" || typeof data?.ts === "number"
        ? Number(data.ts)
        : NaN;
  return Number.isFinite(raw) && raw > 0 ? raw : null;
}

function isPushStale(data: Record<string, unknown> | undefined, now = Date.now()) {
  const sentAt = extractPushSentAt(data);
  if (!sentAt) return false;
  return now - sentAt > PUSH_MAX_AGE_MS;
}

function logPushDebug(event: string, details?: Record<string, unknown>) {
  if (!pushDebugEnabled) return;

  if (details) {
    console.info("[push][app]", event, details);
    return;
  }

  console.info("[push][app]", event);
}

async function setupNotifications(appStateRef: { current: AppStateStatus }) {
  if (isExpoGo) return;
  if (!Notifications) {
    Notifications = await import("expo-notifications");
  }

  logPushDebug("notification_handler_configuring", {
    platform: Platform.OS,
  });

  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const isActive = appStateRef.current === "active";
      logPushDebug("notification_handler_invoked", {
        identifier: notification.request.identifier,
        isActive,
        traceId: extractTraceId(notification.request.content.data as Record<string, unknown> | undefined),
        requestType:
          typeof notification.request.content.data?.requestType === "string"
            ? notification.request.content.data.requestType
            : undefined,
      });
      return {
        shouldShowAlert: !isActive,
        shouldPlaySound: !isActive,
        shouldSetBadge: false,
        shouldShowBanner: !isActive,
        shouldShowList: !isActive,
      };
    },
  });
}

async function getOrCreateDeviceId() {
  const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (existing) {
    logPushDebug("device_id_reused", {
      deviceId: existing,
    });
    return existing;
  }

  const created = `${Platform.OS}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  await SecureStore.setItemAsync(DEVICE_ID_KEY, created);
  logPushDebug("device_id_created", {
    deviceId: created,
  });
  return created;
}

function extractTableId(input: unknown) {
  const value = Number(input);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.floor(value);
}

function resolveExpoProjectId() {
  return (
    Constants.easConfig?.projectId ??
    (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ??
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID?.trim()
  );
}

async function getExpoPushRegistration(input: { deviceId: string; appVersion: string }): Promise<PushDeviceRegistration | null> {
  const projectId = resolveExpoProjectId();
  if (!projectId) {
    console.warn("[push] Missing Expo projectId (EXPO_PUBLIC_EAS_PROJECT_ID)");
    return null;
  }

  logPushDebug("expo_push_project_id_resolved", {
    projectId,
    deviceId: input.deviceId,
  });

  let tokenResponse: { data: string };
  try {
    tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
  } catch (error) {
    console.warn("[push] Failed to obtain Expo push token (network or Expo service)", error);
    return null;
  }

  const payload = createExpoPushRegistration({
    expoToken: tokenResponse.data,
    deviceId: input.deviceId,
    appVersion: input.appVersion,
  });

  if (!payload) {
    console.warn("[push] Expo push token response is empty");
    return null;
  }

  logPushDebug("expo_push_token_received", {
    tokenPreview: previewPushToken(payload.token),
    deviceId: payload.deviceId,
  });

  return payload;
}

async function registerForPush(): Promise<PushDeviceRegistration[]> {
  logPushDebug("register_for_push_started", {
    platform: Platform.OS,
    isDevice: Device.isDevice,
    isExpoGo,
  });

  if (!Device.isDevice) {
    console.info("[push] Skipping registration: physical device is required");
    return [];
  }
  if (isExpoGo) {
    console.info("[push] Skipping registration in Expo Go");
    return [];
  }
  if (!Notifications) {
    Notifications = await import("expo-notifications");
  }

  if (Platform.OS === "android") {
    logPushDebug("android_channel_ensuring_before_token", {
      channelId: NOTIFICATION_CHANNEL_ID,
    });
    await Notifications.setNotificationChannelAsync(
      NOTIFICATION_CHANNEL_ID,
      getAndroidNotificationChannelInput(Notifications),
    );
    logPushDebug("android_channel_ready_before_token", {
      channelId: NOTIFICATION_CHANNEL_ID,
    });
  }

  const permission = await Notifications.getPermissionsAsync();
  logPushDebug("notification_permission_snapshot", {
    status: (permission as { status?: string }).status,
    granted: Boolean((permission as { granted?: boolean }).granted),
    canAskAgain: (permission as { canAskAgain?: boolean }).canAskAgain,
  });
  let granted =
    typeof (permission as { granted?: unknown }).granted === "boolean"
      ? Boolean((permission as { granted?: boolean }).granted)
      : (permission as { status?: string }).status === "granted";

  if (!granted) {
    const request = await Notifications.requestPermissionsAsync();
    logPushDebug("notification_permission_requested", {
      status: (request as { status?: string }).status,
      granted: Boolean((request as { granted?: boolean }).granted),
      canAskAgain: (request as { canAskAgain?: boolean }).canAskAgain,
    });
    granted =
      typeof (request as { granted?: unknown }).granted === "boolean"
        ? Boolean((request as { granted?: boolean }).granted)
        : (request as { status?: string }).status === "granted";
  }

  if (!granted) {
    console.info("[push] Notification permission is not granted");
    return [];
  }

  const deviceId = await getOrCreateDeviceId();
  const appVersion = Constants.expoConfig?.version ?? "1.0.0";
  const registrations: PushDeviceRegistration[] = [];

  if (Platform.OS === "android") {
    try {
      const devicePushToken = await Notifications.getDevicePushTokenAsync();
      logPushDebug("android_device_push_token_received", {
        tokenType: devicePushToken.type,
        tokenPreview: typeof devicePushToken.data === "string" ? previewPushToken(devicePushToken.data) : "(non-string)",
        deviceId,
      });
      const payload = createAndroidPushRegistration({
        devicePushToken,
        deviceId,
        appVersion,
      });
      if (payload) {
        logPushDebug("android_push_registration_payload_ready", {
          platform: payload.platform,
          tokenPreview: previewPushToken(payload.token),
          deviceId: payload.deviceId,
          appVersion: payload.appVersion,
        });
        registrations.push(payload);
      } else {
        console.warn("[push] Android device push token response is invalid");
      }
    } catch (error) {
      console.warn("[push] Failed to obtain Android FCM device token", error);
    }
  }

  const expoPayload = await getExpoPushRegistration({ deviceId, appVersion });
  if (expoPayload) {
    registrations.push(expoPayload);
  }

  if (!registrations.length) {
    logPushDebug("register_for_push_no_payloads");
  } else {
    logPushDebug("register_for_push_payloads_ready", {
      count: registrations.length,
      platforms: registrations.map((item) => item.platform),
    });
  }

  return registrations;
}

function maybeOpenTableFromData(data: Record<string, unknown> | undefined) {
  const tableId = extractTableId(data?.tableId);
  if (!tableId) {
    logPushDebug("notification_navigation_skipped_missing_table", {
      traceId: extractTraceId(data),
      requestType: typeof data?.requestType === "string" ? data.requestType : undefined,
      rawTableId: data?.tableId,
    });
    return;
  }

  const requestType = typeof data?.requestType === "string" ? data.requestType : undefined;
  logPushDebug("notification_navigation_resolved", {
    traceId: extractTraceId(data),
    tableId,
    requestType,
  });
  if (requestType === "waiter" || requestType === "bill") {
    openWaiterQueueForTable(tableId);
    return;
  }

  openWaiterTable(tableId);
}

function alertEyebrow(requestType: IncomingServiceAlert["requestType"]) {
  if (requestType === "bill") return "Счёт";
  if (requestType === "order") return "Новый заказ";
  return "Новый вызов";
}

export function StaffRuntime() {
  const { session } = useAuth();
  const [alertQueue, setAlertQueue] = useState<IncomingServiceAlert[]>([]);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const lastSeenAtRef = useRef(new Map<string, number>());
  const lastPushSyncAtRef = useRef(0);
  const pushSyncInFlightRef = useRef(false);
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
    logPushDebug("foreground_signal_vibrate", {
      tableId: alert.tableId,
      requestType: alert.requestType,
    });
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
        logPushDebug("incoming_alert_skipped", {
          hasAlert: Boolean(alert),
          isWaiterSession,
          appState: appStateRef.current,
          tableId: alert?.tableId,
          requestType: alert?.requestType,
        });
        return;
      }

      const now = Date.now();
      pruneSeenAlerts(now);
      const lastSeenAt = lastSeenAtRef.current.get(alert.dedupeKey) ?? 0;
      if (now - lastSeenAt < ALERT_DEDUPE_MS) {
        logPushDebug("incoming_alert_deduped", {
          dedupeKey: alert.dedupeKey,
          elapsedMs: now - lastSeenAt,
          tableId: alert.tableId,
          requestType: alert.requestType,
        });
        return;
      }

      lastSeenAtRef.current.set(alert.dedupeKey, now);
      setAlertQueue((current) => [...current, alert]);
      logPushDebug("incoming_alert_enqueued", {
        dedupeKey: alert.dedupeKey,
        tableId: alert.tableId,
        requestType: alert.requestType,
        playSignal: options?.playSignal !== false,
      });

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

  const syncPushTokenWithRetry = useCallback(async (payload: PushDeviceRegistration) => {
    for (let attempt = 0; attempt < PUSH_SYNC_MAX_ATTEMPTS; attempt += 1) {
      try {
        logPushDebug("push_token_sync_attempt", {
          attempt: attempt + 1,
          platform: payload.platform,
          tokenPreview: previewPushToken(payload.token),
          deviceId: payload.deviceId,
        });
        await registerPushToken(payload);
        logPushDebug("push_token_sync_success", {
          attempt: attempt + 1,
          platform: payload.platform,
          tokenPreview: previewPushToken(payload.token),
          deviceId: payload.deviceId,
        });
        return true;
      } catch (error) {
        const reason =
          typeof (error as { code?: unknown })?.code === "string"
            ? String((error as { code: string }).code)
            : "unknown";
        const currentAttempt = attempt + 1;
        console.warn(`[push] Failed to sync token (attempt ${currentAttempt}/${PUSH_SYNC_MAX_ATTEMPTS}, reason=${reason})`, error);
        if (currentAttempt >= PUSH_SYNC_MAX_ATTEMPTS) {
          return false;
        }
        await sleep(PUSH_SYNC_RETRY_DELAYS_MS[Math.min(attempt, PUSH_SYNC_RETRY_DELAYS_MS.length - 1)]);
      }
    }
    return false;
  }, []);

  const syncPushPayloads = useCallback(
    async (payloads: PushDeviceRegistration[]) => {
      let successCount = 0;
      for (const payload of payloads) {
        const synced = await syncPushTokenWithRetry(payload);
        if (synced) {
          successCount += 1;
        }
      }
      return successCount > 0;
    },
    [syncPushTokenWithRetry],
  );

  const syncPushToken = useCallback(async (options?: { force?: boolean; payloads?: PushDeviceRegistration[] }) => {
    if (!session || session.role !== "waiter") {
      logPushDebug("push_token_sync_skipped_session", {
        hasSession: Boolean(session),
        role: session?.role,
      });
      return;
    }
    if (pushSyncInFlightRef.current) {
      logPushDebug("push_token_sync_skipped_in_flight");
      return;
    }

    const now = Date.now();
    if (!options?.force && now - lastPushSyncAtRef.current < PUSH_RESYNC_INTERVAL_MS) {
      logPushDebug("push_token_sync_skipped_cooldown", {
        elapsedMs: now - lastPushSyncAtRef.current,
        cooldownMs: PUSH_RESYNC_INTERVAL_MS,
      });
      return;
    }
    pushSyncInFlightRef.current = true;

    try {
      logPushDebug("push_token_sync_started", {
        force: Boolean(options?.force),
        hasPayloadOverride: Boolean(options?.payloads?.length),
      });
      const payloads = options?.payloads?.length ? options.payloads : await registerForPush();
      if (!payloads.length) {
        logPushDebug("push_token_sync_aborted_no_payload");
        return;
      }
      const synced = await syncPushPayloads(payloads);
      if (synced) {
        lastPushSyncAtRef.current = Date.now();
        logPushDebug("push_token_sync_completed", {
          count: payloads.length,
          platforms: payloads.map((item) => item.platform),
        });
      }
    } catch (error) {
      console.warn("[push] Failed to register device for remote notifications", error);
    } finally {
      pushSyncInFlightRef.current = false;
    }
  }, [session, syncPushPayloads]);

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
    void (async () => {
      await setupNotifications(appStateRef);

      if (Platform.OS === "android") {
        if (!Notifications) Notifications = await import("expo-notifications");
        await Notifications.setNotificationChannelAsync(
          NOTIFICATION_CHANNEL_ID,
          getAndroidNotificationChannelInput(Notifications),
        );
        logPushDebug("android_channel_ready_on_mount", {
          channelId: NOTIFICATION_CHANNEL_ID,
        });
      }
    })();
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      logPushDebug("app_state_changed", {
        previousState: appStateRef.current,
        nextState,
      });
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
    let pushTokenSubscription: { remove(): void } | null = null;

    void (async () => {
      if (!Notifications) Notifications = await import("expo-notifications");
      if (cancelled) return;

      logPushDebug("notification_listeners_registering");

      responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
        void (async () => {
          const notificationData = response.notification.request.content.data as Record<string, unknown> | undefined;
          const identifier = response.notification.request.identifier;
          const stale = isPushStale(notificationData);
          logPushDebug("notification_response_received", {
            identifier,
            actionIdentifier: response.actionIdentifier,
            traceId: extractTraceId(notificationData),
            requestType:
              typeof response.notification.request.content.data?.requestType === "string"
                ? response.notification.request.content.data.requestType
                : undefined,
            tableId: response.notification.request.content.data?.tableId,
            stale,
          });
          if (stale) {
            logPushDebug("notification_response_ignored_stale", {
              identifier,
              traceId: extractTraceId(notificationData),
              sentAt: extractPushSentAt(notificationData),
            });
          } else {
            maybeOpenTableFromData(notificationData);
          }
          try {
            await Notifications.clearLastNotificationResponseAsync();
            await Notifications.dismissNotificationAsync(identifier);
          } catch (error) {
            logPushDebug("notification_response_cleanup_failed", {
              identifier,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        })();
      });

      receivedSubscription = Notifications.addNotificationReceivedListener((notification) => {
        const notificationData = notification.request.content.data as Record<string, unknown> | undefined;
        if (isPushStale(notificationData)) {
          logPushDebug("notification_received_ignored_stale", {
            identifier: notification.request.identifier,
            traceId: extractTraceId(notificationData),
            sentAt: extractPushSentAt(notificationData),
            title: notification.request.content.title,
          });
          void Notifications.dismissNotificationAsync(notification.request.identifier).catch((error) => {
            logPushDebug("notification_dismiss_failed", {
              identifier: notification.request.identifier,
              error: error instanceof Error ? error.message : String(error),
            });
          });
          return;
        }
        logPushDebug("notification_received", {
          identifier: notification.request.identifier,
          traceId: extractTraceId(notificationData),
          requestType:
            typeof notification.request.content.data?.requestType === "string"
              ? notification.request.content.data.requestType
              : undefined,
          tableId: notification.request.content.data?.tableId,
          title: notification.request.content.title,
          sentAt: extractPushSentAt(notificationData),
        });
        enqueueIncomingAlert(
          createIncomingServiceAlert({
            id: notification.request.identifier,
            tableId: notification.request.content.data?.tableId,
            requestType: notification.request.content.data?.requestType,
            reason: notification.request.content.body,
            ts: extractPushSentAt(notificationData) ?? Date.now(),
          }),
          { playSignal: true },
        );
      });

      pushTokenSubscription = Notifications.addPushTokenListener((token) => {
        void (async () => {
          logPushDebug("push_token_listener_fired", {
            tokenType: token.type,
            tokenPreview: typeof token.data === "string" ? previewPushToken(token.data) : "(non-string)",
          });
          const deviceId = await getOrCreateDeviceId();
          const appVersion = Constants.expoConfig?.version ?? "1.0.0";
          const payload = createAndroidPushRegistration({
            devicePushToken: token,
            deviceId,
            appVersion,
          });
          if (payload) {
            console.info("[push] Android FCM token refreshed");
            const payloads: PushDeviceRegistration[] = [payload];
            const expoPayload = await getExpoPushRegistration({ deviceId, appVersion });
            if (expoPayload) {
              payloads.push(expoPayload);
            }
            await syncPushToken({
              force: true,
              payloads,
            });
            return;
          }

          if (token.type === "ios") {
            console.info("[push] Native iOS push token refreshed, resyncing Expo push token");
            await syncPushToken({ force: true });
          }
        })();
      });

      void Notifications.getLastNotificationResponseAsync().then((response) => {
        if (!response) {
          logPushDebug("notification_last_response_empty");
          return;
        }
        const notificationData = response.notification.request.content.data as Record<string, unknown> | undefined;
        const identifier = response.notification.request.identifier;
        const stale = isPushStale(notificationData);
        logPushDebug("notification_last_response_found", {
          identifier,
          traceId: extractTraceId(notificationData),
          requestType:
            typeof response.notification.request.content.data?.requestType === "string"
              ? response.notification.request.content.data.requestType
              : undefined,
          tableId: response.notification.request.content.data?.tableId,
          stale,
        });
        if (!stale) {
          maybeOpenTableFromData(notificationData);
        } else {
          logPushDebug("notification_last_response_ignored_stale", {
            identifier,
            traceId: extractTraceId(notificationData),
            sentAt: extractPushSentAt(notificationData),
          });
        }
        void Notifications.clearLastNotificationResponseAsync().catch((error) => {
          logPushDebug("notification_last_response_clear_failed", {
            identifier,
            error: error instanceof Error ? error.message : String(error),
          });
        });
      });
    })();

    return () => {
      cancelled = true;
      logPushDebug("notification_listeners_removing");
      responseSubscription?.remove();
      receivedSubscription?.remove();
      pushTokenSubscription?.remove();
    };
  }, [enqueueIncomingAlert, syncPushToken]);

  useEffect(() => {
    void syncPushToken();
  }, [syncPushToken]);

  useEffect(() => {
    if (!session || session.role !== "waiter") return;

    const timer = setInterval(() => {
      if (appStateRef.current === "active") {
        void syncPushToken();
      }
    }, PUSH_RESYNC_INTERVAL_MS);

    return () => {
      clearInterval(timer);
    };
  }, [session, syncPushToken]);

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
            if (currentAlert.requestType === "order") {
              openWaiterTable(currentAlert.tableId);
            } else {
              openWaiterQueueForTable(currentAlert.tableId);
            }
            dismissCurrentAlert();
          }}
        >
          <View style={styles.alertCopy}>
            <Text style={styles.alertEyebrow}>{alertEyebrow(currentAlert.requestType)}</Text>
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
