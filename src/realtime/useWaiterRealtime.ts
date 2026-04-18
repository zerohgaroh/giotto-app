import { useStaffRealtime } from "./useStaffRealtime";
import type { RealtimeEvent } from "../types/domain";

export function useWaiterRealtime(onEvent: (event: RealtimeEvent) => void) {
  return useStaffRealtime(onEvent);
}
