import { describe, expect, it } from "vitest";
import { summarize, type Trip } from "../src";

const t1: Trip = {
  id: "t1",
  start: "2026-10-01T08:10:00+05:00",
  end: "2026-10-01T08:32:00+05:00",
  amount: 2400,
  payment: "card",
  commission: 360,
};
const t2: Trip = {
  id: "t2",
  start: "2026-10-01T09:05:00+05:00",
  end: "2026-10-01T09:20:00+05:00",
  amount: 1500,
  payment: "cash",
  commission: 225,
};

describe("summarize", () => {
  it("считает пример со страницы вакансии", () => {
    expect(summarize([t1, t2])).toEqual({
      trips: 2,
      revenue: 3900,
      commission: 585,
      net: 3315,
      byPayment: {
        cash: { count: 1, amount: 1500 },
        card: { count: 1, amount: 2400 },
      },
    });
  });

  it("пустой день — все нули, а не NaN/undefined", () => {
    expect(summarize([])).toEqual({
      trips: 0,
      revenue: 0,
      commission: 0,
      net: 0,
      byPayment: { cash: { count: 0, amount: 0 }, card: { count: 0, amount: 0 } },
    });
  });

  it("только наличные — карта остаётся нулём", () => {
    const s = summarize([t2, { ...t2, id: "t3", amount: 700, commission: 105 }]);
    expect(s.byPayment).toEqual({ cash: { count: 2, amount: 2200 }, card: { count: 0, amount: 0 } });
    expect(s.net).toBe(2200 - 330);
  });

  it("поездка без комиссии целиком идёт на руки", () => {
    expect(summarize([{ ...t1, commission: 0 }]).net).toBe(2400);
  });

  it("инвариант: наличные + карта = выручка, выручка − комиссия = на руки", () => {
    const trips: Trip[] = Array.from({ length: 200 }, (_, i) => ({
      ...t1,
      id: `r${i}`,
      amount: 100 + ((i * 7919) % 9000),
      commission: (i * 31) % 100,
      payment: i % 3 === 0 ? "cash" : "card",
    }));
    const s = summarize(trips);
    expect(s.byPayment.cash.amount + s.byPayment.card.amount).toBe(s.revenue);
    expect(s.byPayment.cash.count + s.byPayment.card.count).toBe(s.trips);
    expect(s.revenue - s.commission).toBe(s.net);
  });

  it("большие суммы считаются точно (целые, без float)", () => {
    const big = Array.from({ length: 1000 }, (_, i) => ({ ...t1, id: `b${i}`, amount: 999_999, commission: 149_999 }));
    const s = summarize(big);
    expect(s.revenue).toBe(999_999_000);
    expect(s.net).toBe(850_000_000);
  });
});
