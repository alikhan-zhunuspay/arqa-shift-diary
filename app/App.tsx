import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { DEFAULT_TIME_ZONE, localDate, shiftDay } from "@shift-diary/core";
import { useDay } from "./src/useDay";
import { DayHeader } from "./src/components/DayHeader";
import { SummaryCard } from "./src/components/SummaryCard";
import { TripRow } from "./src/components/TripRow";
import { AddTripSheet } from "./src/components/AddTripSheet";
import { colors } from "./src/theme";
import { dayShort, pluralTrips } from "./src/format";

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <ShiftDiary />
    </SafeAreaProvider>
  );
}

function ShiftDiary() {
  const today = localDate(new Date(), DEFAULT_TIME_ZONE);
  const [date, setDate] = useState(today);
  const [sheetOpen, setSheetOpen] = useState(false);
  const { state, refreshing, reload, refresh } = useDay(date);
  const { toast, show } = useToast();

  const data = state.data;
  const timeZone = data?.timeZone ?? DEFAULT_TIME_ZONE;

  // Первое открытие: если сегодня смены не было, показываем последний день с поездками,
  // а не пустой чек. Дальше дни листает только сам пользователь.
  const firstLoad = useRef(true);
  useEffect(() => {
    if (!firstLoad.current || state.status !== "ready") return;
    firstLoad.current = false;
    const previous = state.data.neighbours.previous;
    if (state.data.date === today && state.data.trips.length === 0 && previous) {
      setDate(previous);
      show(`Сегодня поездок нет — показан ${dayShort(previous)}`);
    }
  }, [state, today, show]);

  const header = (
    <View style={styles.header}>
      <DayHeader
        date={date}
        isToday={date === today}
        onPrev={() => setDate((d) => shiftDay(d, -1))}
        onNext={() => setDate((d) => shiftDay(d, 1))}
        onToday={() => setDate(today)}
      />

      {state.status === "error" ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{state.error}</Text>
          <Pressable onPress={reload} accessibilityRole="button">
            <Text style={styles.errorAction}>Повторить</Text>
          </Pressable>
        </View>
      ) : null}

      {data ? (
        <>
          <SummaryCard date={data.date} summary={data.summary} />
          {data.trips.length > 0 ? (
            <Text style={styles.sectionTitle}>
              {data.trips.length} {pluralTrips(data.trips.length)}
            </Text>
          ) : null}
        </>
      ) : state.status === "loading" ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      ) : null}
    </View>
  );

  const empty =
    data && data.trips.length === 0 ? (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>В этот день поездок нет</Text>
        <View style={styles.jumps}>
          {data.neighbours.previous ? (
            <JumpButton label={`‹ ${dayShort(data.neighbours.previous)}`} onPress={() => setDate(data.neighbours.previous!)} />
          ) : null}
          {data.neighbours.next ? (
            <JumpButton label={`${dayShort(data.neighbours.next)} ›`} onPress={() => setDate(data.neighbours.next!)} />
          ) : null}
        </View>
      </View>
    ) : null;

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <View style={styles.container}>
        <FlatList
          data={data?.trips ?? []}
          keyExtractor={(trip) => trip.id}
          renderItem={({ item, index }) => (
            <View style={[styles.item, index === 0 && styles.itemFirst, index === (data?.trips.length ?? 0) - 1 && styles.itemLast]}>
              <TripRow trip={item} timeZone={timeZone} />
            </View>
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListHeaderComponent={header}
          ListEmptyComponent={empty}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        />

        <SafeAreaView edges={["bottom"]} style={styles.fabWrap} pointerEvents="box-none">
          <Pressable
            onPress={() => setSheetOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Добавить поездку"
            style={({ pressed }) => [styles.fab, pressed && { opacity: 0.85 }]}
          >
            <Text style={styles.fabText}>＋ Поездка</Text>
          </Pressable>
        </SafeAreaView>
      </View>

      <AddTripSheet
        visible={sheetOpen}
        day={date}
        timeZone={timeZone}
        onClose={() => setSheetOpen(false)}
        onCreated={(_trip, replayed) => {
          setSheetOpen(false);
          show(replayed ? "Такая поездка уже сохранена — дубль не создан" : "Поездка добавлена");
          void refresh();
        }}
      />

      {toast}
    </SafeAreaView>
  );
}

function JumpButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.jump} accessibilityRole="button">
      <Text style={styles.jumpText}>{label}</Text>
    </Pressable>
  );
}

function useToast() {
  const [message, setMessage] = useState<string | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!message) return;
    Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    const timer = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => setMessage(null));
    }, 2600);
    return () => clearTimeout(timer);
  }, [message, opacity]);

  const toast = message ? (
    <Animated.View style={[styles.toast, { opacity }]} pointerEvents="none" accessibilityLiveRegion="polite">
      <Text style={styles.toastText}>{message}</Text>
    </Animated.View>
  ) : null;

  return { toast, show: setMessage };
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, width: "100%", maxWidth: 560, alignSelf: "center" },
  list: { paddingHorizontal: 16, paddingBottom: 120 },
  header: { gap: 16, paddingTop: 12, paddingBottom: 8 },
  loader: { marginTop: 48 },
  sectionTitle: { fontSize: 13, fontWeight: "700", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.6, marginTop: 8 },
  item: { overflow: "hidden", borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.border },
  itemFirst: { borderTopWidth: 1, borderTopLeftRadius: 14, borderTopRightRadius: 14 },
  itemLast: { borderBottomWidth: 1, borderBottomLeftRadius: 14, borderBottomRightRadius: 14 },
  separator: { height: 1, backgroundColor: colors.border, marginHorizontal: 0 },
  empty: { alignItems: "center", paddingVertical: 28, gap: 12 },
  emptyTitle: { fontSize: 15, color: colors.muted },
  jumps: { flexDirection: "row", gap: 10 },
  jump: { borderWidth: 1, borderColor: colors.primary, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  jumpText: { color: colors.primary, fontWeight: "600" },
  errorBox: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.dangerBg,
    borderRadius: 12,
    padding: 12,
  },
  errorText: { color: colors.danger, flexShrink: 1 },
  errorAction: { color: colors.danger, fontWeight: "700", marginLeft: 12 },
  fabWrap: { position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center", paddingBottom: 16 },
  fab: {
    backgroundColor: colors.primary,
    borderRadius: 999,
    paddingHorizontal: 26,
    paddingVertical: 15,
    shadowColor: colors.primary,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  fabText: { color: colors.primaryText, fontSize: 16, fontWeight: "700" },
  toast: {
    position: "absolute",
    bottom: 100,
    alignSelf: "center",
    backgroundColor: colors.text,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    maxWidth: "90%",
  },
  toastText: { color: "#fff", fontSize: 14, fontWeight: "600" },
});
