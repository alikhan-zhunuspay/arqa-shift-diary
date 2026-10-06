import { parseTrip, shiftDay, type PaymentMethod, type Trip, type ValidationIssue } from "@shift-diary/core";
import { buildIso, isTime } from "./format";

export type TripForm = {
  start: string; // "HH:MM"
  end: string; // "HH:MM"
  amount: string;
  commission: string;
  payment: PaymentMethod;
};

export type FormErrors = Partial<Record<keyof TripForm | "form", string>>;

export const DEFAULT_COMMISSION_RATE = 0.15;

export function suggestCommission(amount: string): string {
  const value = Number(amount);
  return Number.isFinite(value) && value > 0 ? String(Math.round(value * DEFAULT_COMMISSION_RATE)) : "";
}

const toInt = (raw: string) => (raw.trim() === "" ? NaN : Number(raw.replace(/\s/g, "")));

/**
 * Превращает поля формы в поездку и проверяет её ТЕМИ ЖЕ правилами, что и сервер
 * (общий пакет @shift-diary/core). Если окончание по часам раньше начала —
 * считаем, что поездка перешла через полночь, и переносим окончание на следующий день.
 */
export function buildTrip(
  form: TripForm,
  ctx: { id: string; day: string; offset: string },
): { ok: true; trip: Trip } | { ok: false; errors: FormErrors } {
  const errors: FormErrors = {};
  if (!isTime(form.start)) errors.start = "Время в формате ЧЧ:ММ";
  if (!isTime(form.end)) errors.end = "Время в формате ЧЧ:ММ";
  if (errors.start || errors.end) return { ok: false, errors };

  const endDay = form.end < form.start ? shiftDay(ctx.day, 1) : ctx.day;
  const candidate = {
    id: ctx.id,
    start: buildIso(ctx.day, form.start, ctx.offset),
    end: buildIso(endDay, form.end, ctx.offset),
    amount: toInt(form.amount),
    commission: form.commission.trim() === "" ? 0 : toInt(form.commission),
    payment: form.payment,
  };

  const parsed = parseTrip(candidate);
  if (parsed.ok) return parsed;
  return { ok: false, errors: issuesToErrors(parsed.issues) };
}

export function issuesToErrors(issues: ValidationIssue[]): FormErrors {
  const errors: FormErrors = {};
  for (const issue of issues) {
    const field = (["start", "end", "amount", "commission", "payment"] as const).find((f) => f === issue.field) ?? "form";
    errors[field] ??= issue.message;
  }
  return errors;
}
