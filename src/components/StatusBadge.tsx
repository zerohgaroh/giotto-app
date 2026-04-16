import { StyleSheet, Text, View } from "react-native";
import { statusColors } from "../theme/colors";
import type { ServiceTableStatus } from "../types/domain";

export function StatusBadge({ status }: { status: ServiceTableStatus }) {
  const meta = statusColors[status] ?? statusColors.occupied;
  return (
    <View style={[styles.badge, { backgroundColor: meta.bg }]}> 
      <Text style={[styles.label, { color: meta.text }]}>{meta.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: "700",
  },
});
