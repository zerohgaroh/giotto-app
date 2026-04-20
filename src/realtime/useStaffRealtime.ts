import { useEffect, useRef } from "react";
import type { RealtimeEvent } from "../types/domain";
import { useRealtime } from "./RealtimeProvider";

export function useStaffRealtime(onEvent: (event: RealtimeEvent) => void) {
  const realtime = useRealtime();
  const onEventRef = useRef(onEvent);

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(
    () =>
      realtime.subscribe((event) => {
        onEventRef.current(event);
      }),
    [realtime],
  );

  return {
    connected: realtime.connected,
    connecting: realtime.connecting,
    error: realtime.error,
  };
}
