import type { PaymentMethod, Trip } from "./trip";

export type PaymentBreakdown = { count: number; amount: number };

export type DaySummary = {
  trips: number;
  /** Выручка: сумма всех поездок. */
  revenue: number;
  /** Комиссия парка/агрегатора. */
  commission: number;
  /** «На руки» = выручка − комиссия. */
  net: number;
  byPayment: Record<PaymentMethod, PaymentBreakdown>;
};

export function emptySummary(): DaySummary {
  return {
    trips: 0,
    revenue: 0,
    commission: 0,
    net: 0,
    byPayment: { cash: { count: 0, amount: 0 }, card: { count: 0, amount: 0 } },
  };
}

export function summarize(trips: readonly Trip[]): DaySummary {
  const summary = emptySummary();
  for (const trip of trips) {
    summary.trips += 1;
    summary.revenue += trip.amount;
    summary.commission += trip.commission;
    summary.byPayment[trip.payment].count += 1;
    summary.byPayment[trip.payment].amount += trip.amount;
  }
  summary.net = summary.revenue - summary.commission;
  return summary;
}
