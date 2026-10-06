import { z } from "zod";

/**
 * Суммы храним целыми тенге: без float никаких 0.1 + 0.2.
 * Если понадобятся тиыны — меняем единицу, а не тип.
 */
const money = z.number().int("Сумма должна быть целым числом тенге");

/** ISO 8601 с явным смещением: "2026-10-01T08:10:00+05:00" или "...Z". */
const isoDateTime = z.iso.datetime({ offset: true, message: "Ожидается дата ISO 8601 со смещением, например 2026-10-01T08:10:00+05:00" });

export const PAYMENT_METHODS = ["cash", "card"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const tripInputSchema = z
  .object({
    id: z.string().trim().min(1, "id обязателен").max(64, "id не длиннее 64 символов"),
    start: isoDateTime,
    end: isoDateTime,
    amount: money.positive("Сумма должна быть больше 0"),
    payment: z.enum(PAYMENT_METHODS, { message: "Способ оплаты: cash или card" }),
    commission: money.nonnegative("Комиссия не может быть отрицательной"),
  })
  .strict()
  .superRefine((trip, ctx) => {
    if (Date.parse(trip.end) <= Date.parse(trip.start)) {
      ctx.addIssue({ code: "custom", path: ["end"], message: "Окончание должно быть позже начала" });
    }
    if (trip.commission > trip.amount) {
      ctx.addIssue({ code: "custom", path: ["commission"], message: "Комиссия не может превышать сумму поездки" });
    }
  });

export type Trip = z.infer<typeof tripInputSchema>;

export type ValidationIssue = { field: string; message: string };

export type ParseResult = { ok: true; trip: Trip } | { ok: false; issues: ValidationIssue[] };

export function parseTrip(input: unknown): ParseResult {
  const result = tripInputSchema.safeParse(input);
  if (result.success) return { ok: true, trip: result.data };
  return {
    ok: false,
    issues: result.error.issues.map((issue) => ({
      field: issue.path.join(".") || "body",
      message: issue.message,
    })),
  };
}

/** Одна и та же ли это поездка по содержанию (для идемпотентного повтора). */
export function sameTrip(a: Trip, b: Trip): boolean {
  return (
    a.id === b.id &&
    Date.parse(a.start) === Date.parse(b.start) &&
    Date.parse(a.end) === Date.parse(b.end) &&
    a.amount === b.amount &&
    a.payment === b.payment &&
    a.commission === b.commission
  );
}
