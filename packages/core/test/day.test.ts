import { describe, expect, it } from "vitest";
import { isValidDay, localDate, shiftDay, tripDay } from "../src";

describe("дни", () => {
  it("день определяется по времени Алматы, а не по UTC", () => {
    // 01:30 по Алматы 2 октября = 20:30 UTC 1 октября
    expect(tripDay({ start: "2026-10-02T01:30:00+05:00" })).toBe("2026-10-02");
    expect(tripDay({ start: "2026-10-01T20:30:00Z" })).toBe("2026-10-02");
  });

  it("поездка через полночь относится ко дню начала", () => {
    expect(tripDay({ start: "2026-10-01T23:50:00+05:00" })).toBe("2026-10-01");
  });

  it("учитывает переданный часовой пояс", () => {
    expect(localDate("2026-10-01T20:30:00Z", "UTC")).toBe("2026-10-01");
  });

  it("сдвиг дня через границы месяца и года", () => {
    expect(shiftDay("2026-10-01", -1)).toBe("2026-09-30");
    expect(shiftDay("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("валидирует формат дня", () => {
    expect(isValidDay("2026-10-01")).toBe(true);
    expect(isValidDay("2026-02-30")).toBe(false);
    expect(isValidDay("01.10.2026")).toBe(false);
  });
});
