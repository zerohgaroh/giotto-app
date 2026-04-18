import { Image, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme/colors";

const logo = require("../../assets/brand-logo.png");

export function BrandHeaderTitle() {
  return (
    <View style={styles.wrap}>
      <Image source={logo} style={styles.logo} />
      <Text style={styles.text}>GIOTTO</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  logo: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  text: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 1.4,
    color: colors.navyDeep,
  },
});
