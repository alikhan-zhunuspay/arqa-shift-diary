import { StyleSheet, Text, View } from "react-native";
import type { Trip } from "@shift-diary/core";
import { colors, mono } from "../theme";
import { durationMinutes, money, time } from "../format";

export function TripRow({ trip, timeZone }: { trip: Trip; timeZone: string }) {
  const isCash = trip.payment === "cash";
  return (
    <View style={styles.row}>
      <View style={styles.left}>
        <Text style={styles.time}>
          {time(trip.start, timeZone)}–{time(trip.end, timeZone)}
        </Text>
        <Text style={styles.meta}>
          {durationMinutes(trip.start, trip.end)} мин · комиссия {money(trip.commission)}
        </Text>
      </View>
      <View style={styles.right}>
        <Text style={styles.amount}>{money(trip.amount)}</Text>
        <View style={[styles.badge, { backgroundColor: isCash ? "#E3F4EC" : "#E6EBFB" }]}>
          <Text style={[styles.badgeText, { color: isCash ? colors.cash : colors.card }]}>{isCash ? "нал." : "карта"}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  left: { flexShrink: 1 },
  right: { alignItems: "flex-end", gap: 4 },
  time: { fontFamily: mono, fontSize: 15, color: colors.text, fontWeight: "600" },
  meta: { fontSize: 12, color: colors.muted, marginTop: 3 },
  amount: { fontSize: 16, fontWeight: "700", color: colors.text, fontVariant: ["tabular-nums"] },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: 11, fontWeight: "700" },
});
