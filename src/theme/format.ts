export function formatPrice(value: number) {
  return `${new Intl.NumberFormat("ru-RU").format(Math.max(0, Math.round(value)))} UZS`;
}

export function formatDurationFrom(startMs: number, nowMs: number = Date.now()) {
  const diff = Math.max(0, nowMs - startMs);
  const minutes = Math.floor(diff / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

export function formatTime(value: number) {
  return new Date(value).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}
