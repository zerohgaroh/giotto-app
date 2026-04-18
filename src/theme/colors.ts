export const colors = {
  navy: "#0D2B6B",
  navyDeep: "#0A1F4A",
  gold: "#C8A96E",
  cream: "#FAF7F2",
  white: "#FFFFFF",
  line: "#D4D1CB",
  muted: "#6F6A61",
  text: "#1F1B16",
  success: "#2D6A4F",
  warning: "#B5702A",
};

export const statusColors: Record<string, { bg: string; text: string; label: string }> = {
  free: { bg: "#EAF3DE", text: "#2D6A4F", label: "Свободен" },
  occupied: { bg: "#E6EFFC", text: "#1A3F8A", label: "Занят" },
  waiting: { bg: "#F4E8D3", text: "#8A6A33", label: "Ждёт" },
  ordered: { bg: "#E5ECFA", text: "#0D2B6B", label: "Заказ" },
  bill: { bg: "#F9E9DB", text: "#B5702A", label: "Счёт" },
};
