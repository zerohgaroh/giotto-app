import { useEffect, useState } from "react";
import EventSource, { type CustomEvent, type ErrorEvent, type ExceptionEvent, type TimeoutEvent } from "react-native-sse";
import { API_BASE_URL, getAccessToken, subscribeAccessToken } from "../api/client";
import type { RealtimeEvent } from "../types/domain";

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
  const [token, setToken] = useState<string | null>(() => getAccessToken());

  useEffect(() => subscribeAccessToken(setToken), []);

  useEffect(() => {
    if (!token) {
      setConnected(false);
      return;
    }

    const source = new EventSource<RealtimeEvent["type"]>(`${API_BASE_URL}/api/staff/realtime/stream`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      timeout: 15_000,
      pollingInterval: 0,
    });

    const handleOpen = () => setConnected(true);
    const handleError = (_event: ErrorEvent | TimeoutEvent | ExceptionEvent) => setConnected(false);

    source.addEventListener("open", handleOpen);
    source.addEventListener("error", handleError);

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
      source.removeAllEventListeners();
      source.close();
    };
  }, [onEvent, token]);

  return { connected };
}
