import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme";
import { dayLabel } from "../format";

type Props = {
  date: string;
  isToday: boolean;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
};

export function DayHeader({ date, isToday, onPrev, onNext, onToday }: Props) {
  return (
    <View style={styles.row}>
      <NavButton label="‹" hint="Предыдущий день" onPress={onPrev} />
      <View style={styles.center}>
        <Text style={styles.title} accessibilityRole="header">
          {dayLabel(date)}
        </Text>
        {isToday ? (
          <Text style={styles.sub}>сегодня</Text>
        ) : (
          <Pressable onPress={onToday} hitSlop={8} accessibilityRole="button">
            <Text style={styles.link}>к сегодняшнему дню</Text>
          </Pressable>
        )}
      </View>
      <NavButton label="›" hint="Следующий день" onPress={onNext} />
    </View>
  );
}

function NavButton({ label, hint, onPress }: { label: string; hint: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={hint}
      hitSlop={6}
      style={({ pressed }) => [styles.nav, pressed && styles.navPressed]}
    >
      <Text style={styles.navText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  center: { flex: 1, alignItems: "center" },
  title: { fontSize: 20, fontWeight: "700", color: colors.text },
  sub: { marginTop: 2, fontSize: 13, color: colors.muted },
  link: { marginTop: 2, fontSize: 13, color: colors.primary, fontWeight: "600" },
  nav: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  navPressed: { backgroundColor: colors.border },
  navText: { fontSize: 26, lineHeight: 28, color: colors.text, marginTop: -2 },
});
