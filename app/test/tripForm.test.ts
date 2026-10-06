import { describe, expect, it } from "vitest";
import { buildTrip, suggestCommission, type TripForm } from "../src/tripForm";
import { money, pluralTrips } from "../src/format";

const ctx = { id: "abc", day: "2026-10-01", offset: "+05:00" };
const form: TripForm = { start: "08:10", end: "08:32", amount: "2400", commission: "360", payment: "card" };

describe("buildTrip", () => {
  it("собирает поездку из формы", () => {
    expect(buildTrip(form, ctx)).toEqual({
      ok: true,
      trip: {
        id: "abc",
        start: "2026-10-01T08:10:00+05:00",
        end: "2026-10-01T08:32:00+05:00",
        amount: 2400,
        commission: 360,
        payment: "card",
      },
    });
  });

  it("окончание после полуночи переносит на следующий день", () => {
    const r = buildTrip({ ...form, start: "23:50", end: "00:15" }, ctx);
    expect(r.ok && r.trip.end).toBe("2026-10-02T00:15:00+05:00");
  });

  it("показывает ошибки сервера-совместимых правил у нужных полей", () => {
    const r = buildTrip({ ...form, amount: "0", commission: "0", end: "08:10" }, ctx);
    expect(r).toEqual({
      ok: false,
      errors: { amount: "Сумма должна быть больше 0", end: "Окончание должно быть позже начала" },
    });
  });

  it("пустая сумма и кривое время — ошибки, а не NaN на сервере", () => {
    expect(buildTrip({ ...form, amount: "" }, ctx).ok).toBe(false);
    expect(buildTrip({ ...form, start: "8:1" }, ctx)).toMatchObject({ ok: false, errors: { start: expect.any(String) } });
  });

  it("пустая комиссия = 0", () => {
    const r = buildTrip({ ...form, commission: "" }, ctx);
    expect(r.ok && r.trip.commission).toBe(0);
  });
});

describe("форматирование", () => {
  it("деньги с разрядами и знаком", () => {
    expect(money(3315)).toBe("3 315 ₸");
    expect(money(-585)).toBe("−585 ₸");
    expect(money(1234567)).toBe("1 234 567 ₸");
  });
  it("склонение", () => {
    expect([1, 2, 5, 11, 21, 22, 112].map(pluralTrips)).toEqual([
      "поездка", "поездки", "поездок", "поездок", "поездка", "поездки", "поездок",
    ]);
  });
  it("подсказка комиссии 15%", () => {
    expect(suggestCommission("2400")).toBe("360");
    expect(suggestCommission("")).toBe("");
  });
});

describe("найдено при ручной проверке", () => {
  it("14:30 → 14:00 — не «поездка через полночь на 23,5 часа», а ошибка", () => {
    expect(buildTrip({ ...form, start: "14:30", end: "14:00" }, ctx)).toMatchObject({
      ok: false,
      errors: { end: "Поездка не может длиться дольше 12 часов" },
    });
  });

  it("пустая сумма — «Укажите сумму»", () => {
    expect(buildTrip({ ...form, amount: "", commission: "" }, ctx)).toEqual({ ok: false, errors: { amount: "Укажите сумму" } });
  });
});
