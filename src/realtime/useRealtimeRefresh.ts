import { useEffect, useRef } from "react";
import type { RealtimeEvent } from "../types/domain";
import { useRealtime } from "./RealtimeProvider";
import { createRealtimeRefreshBatcher } from "./realtimeState";

export function useRealtimeRefresh(input: {
  filter?: (event: RealtimeEvent) => boolean;
  refresh: () => void | Promise<void>;
  debounceMs?: number;
}) {
  const realtime = useRealtime();
  const filterRef = useRef(input.filter);
  const refreshRef = useRef(input.refresh);
  const batcherRef = useRef(
    createRealtimeRefreshBatcher({
      refresh: () => refreshRef.current(),
      delayMs: input.debounceMs,
      onError: (error) => {
        console.warn("[realtime] Failed to refresh screen state from realtime event", error);
      },
    }),
  );

  useEffect(() => {
    filterRef.current = input.filter;
    refreshRef.current = input.refresh;
  }, [input.filter, input.refresh]);

  useEffect(() => {
    batcherRef.current.cancel();
    batcherRef.current = createRealtimeRefreshBatcher({
      refresh: () => refreshRef.current(),
      delayMs: input.debounceMs,
      onError: (error) => {
        console.warn("[realtime] Failed to refresh screen state from realtime event", error);
      },
    });
    return () => batcherRef.current.cancel();
  }, [input.debounceMs]);

  useEffect(
    () =>
      realtime.subscribe((event) => {
        if (filterRef.current && !filterRef.current(event)) return;
        batcherRef.current.schedule();
      }),
    [realtime],
  );

  useEffect(() => {
    if (realtime.connected) {
      batcherRef.current.schedule();
    }
  }, [realtime.connected, realtime.reconnectCount]);

  return {
    connected: realtime.connected,
    connecting: realtime.connecting,
    error: realtime.error,
  };
}
