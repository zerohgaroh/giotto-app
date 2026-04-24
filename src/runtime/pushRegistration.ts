import type { DevicePushToken } from "expo-notifications";
import type { PushDeviceRegistration } from "../types/domain";

export const NOTIFICATION_CHANNEL_ID = "giotto-service-alerts";

export function getAndroidNotificationChannelInput(Notifications: typeof import("expo-notifications")) {
  return {
    name: "Giotto service alerts",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 180, 120, 220],
    enableVibrate: true,
    sound: "default" as const,
    bypassDnd: false,
    showBadge: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  };
}

export function createAndroidPushRegistration(input: {
  devicePushToken: Pick<DevicePushToken, "type" | "data">;
  deviceId: string;
  appVersion?: string;
}): PushDeviceRegistration | null {
  if (input.devicePushToken.type !== "android") {
    return null;
  }

  if (typeof input.devicePushToken.data !== "string") {
    return null;
  }

  const token = input.devicePushToken.data.trim();
  const deviceId = input.deviceId.trim();
  const appVersion = input.appVersion?.trim();
  if (!token || !deviceId) {
    return null;
  }

  return {
    token,
    platform: "android",
    deviceId,
    ...(appVersion ? { appVersion } : {}),
  };
}
