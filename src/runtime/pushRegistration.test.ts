import assert from "node:assert/strict";
import test from "node:test";
import { createAndroidPushRegistration } from "./pushRegistration";

test("createAndroidPushRegistration normalizes a native Android push token", () => {
  const registration = createAndroidPushRegistration({
    devicePushToken: {
      type: "android",
      data: "  fcm-token-123  ",
    },
    deviceId: "  device-42  ",
    appVersion: " 1.0.0 ",
  });

  assert.deepEqual(registration, {
    token: "fcm-token-123",
    platform: "android",
    deviceId: "device-42",
    appVersion: "1.0.0",
  });
});

test("createAndroidPushRegistration ignores unsupported or empty device token payloads", () => {
  assert.equal(
    createAndroidPushRegistration({
      devicePushToken: {
        type: "ios",
        data: "apns-token",
      },
      deviceId: "device-42",
      appVersion: "1.0.0",
    }),
    null,
  );

  assert.equal(
    createAndroidPushRegistration({
      devicePushToken: {
        type: "android",
        data: "   ",
      },
      deviceId: "device-42",
      appVersion: "1.0.0",
    }),
    null,
  );

  assert.equal(
    createAndroidPushRegistration({
      devicePushToken: {
        type: "android",
        data: 123,
      },
      deviceId: "device-42",
      appVersion: "1.0.0",
    }),
    null,
  );
});
