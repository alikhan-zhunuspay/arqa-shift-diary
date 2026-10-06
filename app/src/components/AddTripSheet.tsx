import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { randomUUID } from "expo-crypto";
import type { PaymentMethod, Trip } from "@shift-diary/core";
import { ApiError, createTrip } from "../api";
import { colors } from "../theme";
import { dayLabel, utcOffset } from "../format";
import { buildTrip, issuesToErrors, suggestCommission, type FormErrors, type TripForm } from "../tripForm";

type Props = {
  visible: boolean;
  day: string;
  timeZone: string;
  onClose: () => void;
  onCreated: (trip: Trip, replayed: boolean) => void;
};

const EMPTY: TripForm = { start: "", end: "", amount: "", commission: "", payment: "card" };

export function AddTripSheet({ visible, day, timeZone, onClose, onCreated }: Props) {
  const [form, setForm] = useState<TripForm>(EMPTY);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [commissionTouched, setCommissionTouched] = useState(false);
  // id поездки создаётся один раз на открытие формы и не меняется при повторных нажатиях
  // и автоповторах: так сервер узнаёт повтор и не создаёт дубль.
  const idRef = useRef<string>(randomUUID());

  useEffect(() => {
    if (visible) {
      setForm(EMPTY);
      setErrors({});
      setCommissionTouched(false);
      idRef.current = randomUUID();
    }
  }, [visible]);

  const set = <K extends keyof TripForm>(key: K, value: TripForm[K]) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "amount" && !commissionTouched) next.commission = suggestCommission(String(value));
      return next;
    });
    setErrors((prev) => ({ ...prev, [key]: undefined, form: undefined }));
  };

  const submit = async () => {
    if (submitting) return;
    const built = buildTrip(form, { id: idRef.current, day, offset: utcOffset(timeZone, new Date(`${day}T12:00:00Z`)) });
    if (!built.ok) {
      setErrors(built.errors);
      return;
    }
    setSubmitting(true);
    try {
      const { trip, replayed } = await createTrip(built.trip);
      onCreated(trip, replayed);
    } catch (error) {
      if (error instanceof ApiError && error.issues.length) setErrors(issuesToErrors(error.issues));
      else setErrors({ form: error instanceof ApiError ? `${error.message}. Можно нажать «Сохранить» ещё раз — дубля не будет.` : "Что-то пошло не так" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Закрыть" />
        <View style={styles.sheet}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
            <View style={styles.handle} />
            <Text style={styles.title}>Новая поездка</Text>
            <Text style={styles.subtitle}>{dayLabel(day)}</Text>

            <View style={styles.row}>
              <Field label="Начало" error={errors.start} style={styles.half}>
                <TimeInput value={form.start} onChange={(v) => set("start", v)} placeholder="08:10" />
              </Field>
              <Field label="Окончание" error={errors.end} style={styles.half}>
                <TimeInput value={form.end} onChange={(v) => set("end", v)} placeholder="08:32" />
              </Field>
            </View>

            <View style={styles.row}>
              <Field label="Сумма, ₸" error={errors.amount} style={styles.half}>
                <NumberInput value={form.amount} onChange={(v) => set("amount", v)} placeholder="2400" />
              </Field>
              <Field label="Комиссия, ₸" error={errors.commission} style={styles.half} hint={commissionTouched ? undefined : "15% по умолчанию"}>
                <NumberInput
                  value={form.commission}
                  onChange={(v) => {
                    setCommissionTouched(true);
                    set("commission", v);
                  }}
                  placeholder="360"
                />
              </Field>
            </View>

            <Field label="Оплата" error={errors.payment}>
              <View style={styles.segment}>
                {(["card", "cash"] as PaymentMethod[]).map((method) => {
                  const active = form.payment === method;
                  return (
                    <Pressable
                      key={method}
                      onPress={() => set("payment", method)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: active }}
                      style={[styles.segmentItem, active && styles.segmentActive]}
                    >
                      <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{method === "card" ? "Карта" : "Наличные"}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </Field>

            {errors.form ? <Text style={styles.formError}>{errors.form}</Text> : null}

            <Pressable
              onPress={submit}
              disabled={submitting}
              accessibilityRole="button"
              style={({ pressed }) => [styles.primary, (pressed || submitting) && { opacity: 0.8 }]}
            >
              {submitting ? <ActivityIndicator color={colors.primaryText} /> : <Text style={styles.primaryText}>Сохранить</Text>}
            </Pressable>
            <Pressable onPress={onClose} style={styles.secondary} accessibilityRole="button">
              <Text style={styles.secondaryText}>Отмена</Text>
            </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Field({ label, error, hint, style, children }: { label: string; error?: string; hint?: string; style?: object; children: React.ReactNode }) {
  return (
    <View style={[styles.field, style]}>
      <Text style={styles.label}>{label}</Text>
      {children}
      {error ? <Text style={styles.error}>{error}</Text> : hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

/** Ввод времени: оставляем цифры и сами ставим двоеточие — "0810" → "08:10". */
function TimeInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <TextInput
      value={value}
      onChangeText={(text) => {
        const digits = text.replace(/\D/g, "").slice(0, 4);
        onChange(digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits);
      }}
      placeholder={placeholder}
      placeholderTextColor="#9CA3AF"
      keyboardType="number-pad"
      maxLength={5}
      style={styles.input}
    />
  );
}

function NumberInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <TextInput
      value={value}
      onChangeText={(text) => onChange(text.replace(/\D/g, "").slice(0, 9))}
      placeholder={placeholder}
      placeholderTextColor="#9CA3AF"
      keyboardType="number-pad"
      style={styles.input}
    />
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(17,24,39,0.45)" },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "92%",
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
  },
  content: { padding: 20, paddingBottom: 32 },
  handle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: 12 },
  title: { fontSize: 20, fontWeight: "700", color: colors.text },
  subtitle: { fontSize: 14, color: colors.muted, marginTop: 2, marginBottom: 16 },
  row: { flexDirection: "row", gap: 12 },
  half: { flex: 1 },
  field: { marginBottom: 14 },
  label: { fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 17,
    color: colors.text,
    backgroundColor: "#FAFAFB",
    fontVariant: ["tabular-nums"],
  },
  error: { color: colors.danger, fontSize: 12, marginTop: 4 },
  hint: { color: colors.muted, fontSize: 12, marginTop: 4 },
  segment: { flexDirection: "row", backgroundColor: colors.bg, borderRadius: 10, padding: 4 },
  segmentItem: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: "center" },
  segmentActive: { backgroundColor: colors.surface, shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 4, elevation: 1 },
  segmentText: { fontSize: 15, color: colors.muted, fontWeight: "600" },
  segmentTextActive: { color: colors.text },
  formError: { backgroundColor: colors.dangerBg, color: colors.danger, padding: 12, borderRadius: 10, marginBottom: 12, fontSize: 14 },
  primary: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 15, alignItems: "center", marginTop: 4 },
  primaryText: { color: colors.primaryText, fontSize: 16, fontWeight: "700" },
  secondary: { paddingVertical: 14, alignItems: "center" },
  secondaryText: { color: colors.muted, fontSize: 15, fontWeight: "600" },
});
