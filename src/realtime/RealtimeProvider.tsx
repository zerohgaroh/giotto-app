import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState, type AppStateStatus } from "react-native";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import EventSource, { type CustomEvent, type ErrorEvent, type ExceptionEvent, type TimeoutEvent } from "react-native-sse";
import { API_BASE_URL, ensureFreshAccessToken } from "../api/client";
import { useAuth } from "../context/AuthContext";
import type { RealtimeEvent } from "../types/domain";
import { createRealtimeDeduper, serializeRealtimeCursor, STAFF_REALTIME_EVENT_NAMES } from "./realtimeState";

type StaffRealtimeEventName = RealtimeEvent["type"] | "ready";
type RealtimeListener = (event: RealtimeEvent) => void;

type RealtimeContextValue = {
  connected: boolean;
  connecting: boolean;
  error: string;
  reconnectCount: number;
  subscribe: (listener: RealtimeListener) => () => void;
  reconnect: () => void;
};

const RealtimeContext = createContext<RealtimeContextValue | null>(null);
const CURSOR_KEY_PREFIX = "giotto.mobile.realtimeCursor.v1";
const BACKOFF_STEPS_MS = [1_000, 2_000, 5_000, 10_000, 20_000];

function cursorKeyForSession(session: { role: string; userId: string } | null) {
  return session ? `${CURSOR_KEY_PREFIX}.${session.role}.${session.userId}` : null;
}

function buildStreamUrl(token: string, cursor: string | null) {
  const url = new URL(`${API_BASE_URL}/api/staff/realtime/stream`);
  url.searchParams.set("accessToken", token);
  if (cursor) {
    url.searchParams.set("cursor", cursor);
  }
  return url.toString();
}

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");
  const [reconnectNonce, setReconnectNonce] = useState(0);
  const [reconnectCount, setReconnectCount] = useState(0);
  const listenersRef = useRef(new Set<RealtimeListener>());
  const sourceRef = useRef<EventSource<StaffRealtimeEventName> | null>(null);
  const deduperRef = useRef(createRealtimeDeduper());
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const retryAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const forceRefreshNextRef = useRef(false);
  const sessionKey = cursorKeyForSession(session);

  const closeSource = useCallback(() => {
    sourceRef.current?.removeAllEventListeners();
    sourceRef.current?.close();
    sourceRef.current = null;
  }, []);

  const scheduleReconnect = useCallback((forceRefresh = false) => {
    if (forceRefresh) {
      forceRefreshNextRef.current = true;
    }
    if (reconnectTimerRef.current) return;

    const delay = BACKOFF_STEPS_MS[Math.min(retryAttemptRef.current, BACKOFF_STEPS_MS.length - 1)];
    retryAttemptRef.current += 1;
    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      setReconnectNonce((current) => current + 1);
    }, delay);
  }, []);

  const reconnect = useCallback(() => {
    retryAttemptRef.current = 0;
    forceRefreshNextRef.current = true;
    setReconnectNonce((current) => current + 1);
  }, []);

  const subscribe = useCallback((listener: RealtimeListener) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      const previous = appStateRef.current;
      appStateRef.current = nextState;

      if ((previous === "background" || previous === "inactive") && nextState === "active") {
        reconnect();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [reconnect]);

  useEffect(() => {
    let cancelled = false;

    closeSource();
    deduperRef.current.clear();

    if (!session || !sessionKey) {
      setConnected(false);
      setConnecting(false);
      setError("");
      return () => {
        cancelled = true;
      };
    }

    setConnecting(true);
    setConnected(false);

    void (async () => {
      try {
        const token = await ensureFreshAccessToken(forceRefreshNextRef.current ? Number.MAX_SAFE_INTEGER : 60_000);
        forceRefreshNextRef.current = false;
        if (cancelled) return;
        if (!token) {
          setConnecting(false);
          setError("Нет active staff token.");
          return;
        }

        const cursor = await AsyncStorage.getItem(sessionKey);
        if (cancelled) return;

        const source = new EventSource<StaffRealtimeEventName>(buildStreamUrl(token, cursor), {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          timeout: 0,
          pollingInterval: 5_000,
        });
        sourceRef.current = source;
        let connectedOnce = false;

        const markConnected = () => {
          if (connectedOnce) return;
          connectedOnce = true;
          retryAttemptRef.current = 0;
          setConnected(true);
          setConnecting(false);
          setError("");
          setReconnectCount((current) => current + 1);
        };

        const handleError = (_event: ErrorEvent | TimeoutEvent | ExceptionEvent) => {
          if (cancelled) return;
          closeSource();
          setConnected(false);
          setConnecting(false);
          setError("Realtime connection lost.");
          scheduleReconnect(true);
        };

        source.addEventListener("open", markConnected);
        source.addEventListener("ready", markConnected);
        source.addEventListener("error", handleError);

        for (const eventName of STAFF_REALTIME_EVENT_NAMES) {
          source.addEventListener(eventName, (event: CustomEvent<typeof eventName>) => {
            if (!event.data) return;
            try {
              const parsed = JSON.parse(event.data) as RealtimeEvent;
              if (!deduperRef.current.accept(parsed)) return;

              const nextCursor = serializeRealtimeCursor(parsed);
              void AsyncStorage.setItem(sessionKey, nextCursor);

              for (const listener of listenersRef.current) {
                listener(parsed);
              }
            } catch {
              // Ignore malformed realtime frames.
            }
          });
        }
      } catch {
        if (cancelled) return;
        setConnected(false);
        setConnecting(false);
        setError("Realtime connection failed.");
        scheduleReconnect(true);
      }
    })();

    return () => {
      cancelled = true;
      closeSource();
    };
  }, [closeSource, reconnectNonce, scheduleReconnect, session, sessionKey]);

  useEffect(() => {
    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      closeSource();
    };
  }, [closeSource]);

  const value = useMemo<RealtimeContextValue>(
    () => ({
      connected,
      connecting,
      error,
      reconnectCount,
      subscribe,
      reconnect,
    }),
    [connected, connecting, error, reconnect, reconnectCount, subscribe],
  );

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime() {
  const ctx = useContext(RealtimeContext);
  if (!ctx) {
    throw new Error("useRealtime must be used inside RealtimeProvider");
  }
  return ctx;
}
