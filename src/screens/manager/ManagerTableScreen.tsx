import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { SafeAreaView, StyleSheet } from "react-native";
import type { ManagerStackParamList } from "../../navigation/types";
import { colors } from "../../theme/colors";
import { ManagerTablePanel } from "./ManagerTablePanel";

type Props = NativeStackScreenProps<ManagerStackParamList, "ManagerTable">;

export function ManagerTableScreen({ navigation, route }: Props) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ManagerTablePanel tableId={route.params.tableId} onBack={() => navigation.goBack()} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.cream,
  },
});

