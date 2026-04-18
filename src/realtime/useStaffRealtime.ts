import { useEffect, useState } from "react";
import EventSource, { type CustomEvent, type ErrorEvent, type ExceptionEvent, type TimeoutEvent } from "react-native-sse";
import { API_BASE_URL, getAccessToken, subscribeAccessToken } from "../api/client";
import type { RealtimeEvent } from "../types/domain";

type StaffRealtimeEventName = RealtimeEvent["type"] | "ready";

const EVENT_NAMES: RealtimeEvent["type"][] = [
  "waiter:called",
  "bill:requested",
  "waiter:acknowledged",
  "waiter:done",
  "order:added_by_waiter",
  "review:submitted",
  "task:created",
  "task:updated",
  "task:completed",
  "shift:summary_changed",
  "table:status_changed",
  "table:assignment_changed",
  "menu:changed",
  "table:created",
  "table:archived",
  "table:restored",
  "floor:layout_changed",
  "waiter:created",
  "waiter:updated",
  "waiter:deactivated",
  "waiter:password_reset",
];

export function useStaffRealtime(onEvent: (event: RealtimeEvent) => void) {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(true);
  const [token, setToken] = useState<string | null>(() => getAccessToken());

  useEffect(() => subscribeAccessToken(setToken), []);

  useEffect(() => {
    if (!token) {
      setConnected(false);
      setConnecting(false);
      return;
    }

    setConnecting(true);
    const streamUrl = `${API_BASE_URL}/api/staff/realtime/stream?accessToken=${encodeURIComponent(token)}`;

    const source = new EventSource<StaffRealtimeEventName>(streamUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      timeout: 0,
      pollingInterval: 5_000,
    });

    const markConnected = () => {
      setConnected(true);
      setConnecting(false);
    };
    const handleError = (_event: ErrorEvent | TimeoutEvent | ExceptionEvent) => {
      setConnected(false);
      setConnecting(false);
    };

    source.addEventListener("open", markConnected);
    source.addEventListener("error", handleError);
    source.addEventListener("ready", markConnected);

    for (const eventName of EVENT_NAMES) {
      source.addEventListener(eventName, (event: CustomEvent<typeof eventName>) => {
        if (!event.data) return;
        try {
          onEvent(JSON.parse(event.data) as RealtimeEvent);
        } catch {
          // ignore malformed payloads
        }
      });
    }

    return () => {
      setConnected(false);
      setConnecting(true);
      source.removeAllEventListeners();
      source.close();
    };
  }, [onEvent, token]);

  return { connected, connecting };
}
