import Constants from "expo-constants";
import * as Device from "expo-device";
let Notifications: typeof import("expo-notifications");
import * as SecureStore from "expo-secure-store";
import { useEffect } from "react";
import { Platform } from "react-native";
import { registerPushToken } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { openWaiterQueueForTable, openWaiterTable } from "../navigation/navigationRef";
import type { PushDeviceRegistration } from "../types/domain";

const DEVICE_ID_KEY = "giotto.mobile.deviceId.v1";



// Отключаем уведомления в Expo Go (appOwnership === 'expo')
const isExpoGo = Constants.appOwnership === 'expo';


async function setupNotifications() {
  if (isExpoGo) return;
  if (!Notifications) {
    Notifications = await import("expo-notifications");
  }
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
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

  // Отключаем всю push-логику и импорт уведомлений в Expo Go
  if (isExpoGo) {
    return null;
  }

  useEffect(() => {
    setupNotifications();
    if (Platform.OS === "android") {
      (async () => {
        if (!Notifications) Notifications = await import("expo-notifications");
        await Notifications.setNotificationChannelAsync("default", {
          name: "default",
          importance: Notifications.AndroidImportance.MAX,
        });
      })();
    }
  }, []);

  useEffect(() => {
    (async () => {
      if (!Notifications) Notifications = await import("expo-notifications");
      const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
        maybeOpenTableFromData(response.notification.request.content.data as Record<string, unknown>);
      });
      void Notifications.getLastNotificationResponseAsync().then((response) => {
        if (!response) return;
        maybeOpenTableFromData(response.notification.request.content.data as Record<string, unknown>);
      });
      return () => {
        subscription.remove();
      };
    })();
  }, []);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    const syncPushToken = async () => {
      try {
        const payload = await registerForPush();
        if (!payload || cancelled) return;
        await registerPushToken(payload);
      } catch {
        // Push registration should not block the waiter session.
      }
    };
    void syncPushToken();
    return () => {
      cancelled = true;
    };
  }, [session]);
  return null;
}
