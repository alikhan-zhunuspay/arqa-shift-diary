import { StyleSheet, Text, View } from "react-native";
import type { DaySummary } from "@shift-diary/core";
import { colors, mono } from "../theme";
import { dayShort, money } from "../format";

/** Сводка за день в виде чека — как на странице вакансии. */
export function SummaryCard({ date, summary }: { date: string; summary: DaySummary }) {
  const { cash, card } = summary.byPayment;
  return (
    <View style={styles.paper} accessible accessibilityLabel={`На руки ${money(summary.net)}`}>
      <Text style={styles.heading}>Дневник смен</Text>
      <Text style={styles.date}>{dayShort(date)}</Text>
      <View style={styles.rule} />
      <Line label="Поездок" value={String(summary.trips)} />
      <Line label="Выручка" value={money(summary.revenue)} />
      <Line label="Комиссия" value={summary.commission ? money(-summary.commission) : money(0)} />
      <Line label="Наличные" value={`${money(cash.amount)} · ${cash.count}`} color={colors.cash} />
      <Line label="Карта" value={`${money(card.amount)} · ${card.count}`} color={colors.card} />
      <View style={styles.rule} />
      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>На руки</Text>
        <Text style={styles.total}>{money(summary.net)}</Text>
      </View>
    </View>
  );
}

function Line({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.line}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  paper: {
    backgroundColor: colors.paper,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.paperEdge,
    paddingHorizontal: 20,
    paddingVertical: 18,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  heading: { fontFamily: mono, fontSize: 15, fontWeight: "700", textAlign: "center", color: colors.text },
  date: { fontFamily: mono, fontSize: 13, textAlign: "center", color: colors.muted, marginTop: 2 },
  rule: { borderBottomWidth: 1, borderStyle: "dashed", borderColor: "#CDBF98", marginVertical: 12 },
  line: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  label: { fontFamily: mono, fontSize: 14, color: colors.text },
  value: { fontFamily: mono, fontSize: 14, color: colors.text, fontVariant: ["tabular-nums"] },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  totalLabel: { fontFamily: mono, fontSize: 15, color: colors.text },
  total: { fontSize: 30, fontWeight: "800", color: colors.text, fontVariant: ["tabular-nums"] },
});
