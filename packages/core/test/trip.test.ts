import { describe, expect, it } from "vitest";
import { parseTrip, sameTrip } from "../src";

const valid = {
  id: "t1",
  start: "2026-10-01T08:10:00+05:00",
  end: "2026-10-01T08:32:00+05:00",
  amount: 2400,
  payment: "card",
  commission: 360,
};

function issuesOf(input: unknown) {
  const r = parseTrip(input);
  if (r.ok) throw new Error("ожидалась ошибка валидации");
  return r.issues;
}

describe("parseTrip", () => {
  it("принимает корректную поездку", () => {
    expect(parseTrip(valid)).toEqual({ ok: true, trip: valid });
  });

  it.each([0, -100])("отклоняет сумму %s", (amount) => {
    expect(issuesOf({ ...valid, amount })).toContainEqual({ field: "amount", message: "Сумма должна быть больше 0" });
  });

  it("отклоняет дробные суммы", () => {
    expect(issuesOf({ ...valid, amount: 10.5 })[0]?.field).toBe("amount");
  });

  it("отклоняет окончание раньше начала", () => {
    expect(issuesOf({ ...valid, end: "2026-10-01T08:00:00+05:00" })).toContainEqual({
      field: "end",
      message: "Окончание должно быть позже начала",
    });
  });

  it("отклоняет окончание, равное началу", () => {
    expect(issuesOf({ ...valid, end: valid.start })[0]?.field).toBe("end");
  });

  it("сравнивает моменты времени, а не строки: разные смещения", () => {
    // 08:00 UTC = 13:00 по Алматы, т. е. позже 08:10+05:00 — валидно
    expect(parseTrip({ ...valid, end: "2026-10-01T08:00:00Z" }).ok).toBe(true);
    // 03:00 UTC = 08:00+05:00, раньше начала
    expect(parseTrip({ ...valid, end: "2026-10-01T03:00:00Z" }).ok).toBe(false);
  });

  it("требует смещение часового пояса в датах", () => {
    expect(issuesOf({ ...valid, start: "2026-10-01T08:10:00" })[0]?.field).toBe("start");
  });

  it("отклоняет неизвестный способ оплаты", () => {
    expect(issuesOf({ ...valid, payment: "crypto" })[0]?.field).toBe("payment");
  });

  it("отклоняет отрицательную комиссию и комиссию больше суммы", () => {
    expect(issuesOf({ ...valid, commission: -1 })[0]?.field).toBe("commission");
    expect(issuesOf({ ...valid, commission: 2401 })[0]?.field).toBe("commission");
  });

  it("отклоняет лишние поля и пустой id", () => {
    expect(parseTrip({ ...valid, driver: "x" }).ok).toBe(false);
    expect(issuesOf({ ...valid, id: "  " })[0]?.field).toBe("id");
  });

  it("не падает на мусоре", () => {
    expect(parseTrip(null).ok).toBe(false);
    expect(parseTrip("t1").ok).toBe(false);
  });
});

describe("sameTrip", () => {
  it("один и тот же момент в разной записи — та же поездка", () => {
    expect(sameTrip(valid as never, { ...valid, start: "2026-10-01T03:10:00Z" } as never)).toBe(true);
  });
  it("другая сумма — другая поездка", () => {
    expect(sameTrip(valid as never, { ...valid, amount: 2500 } as never)).toBe(false);
  });
});
