import { parseTrip } from "@shift-diary/core";
import { addTrip, type TripStore } from "./store";

export type SeedReport = { created: number; replayed: number; rejected: { index: number; reason: string }[] };

/**
 * Загружает поездки через ту же валидацию и ту же идемпотентную вставку, что и API.
 * Повторный запуск ничего не дублирует.
 */
export async function seedTrips(store: TripStore, raw: unknown): Promise<SeedReport> {
  if (!Array.isArray(raw)) throw new Error("Ожидался массив поездок");

  const report: SeedReport = { created: 0, replayed: 0, rejected: [] };
  for (const [index, item] of raw.entries()) {
    const parsed = parseTrip(item);
    if (!parsed.ok) {
      report.rejected.push({ index, reason: parsed.issues.map((i) => `${i.field}: ${i.message}`).join("; ") });
      continue;
    }
    const result = await addTrip(store, parsed.trip);
    if (result.status === "conflict") report.rejected.push({ index, reason: `id ${parsed.trip.id} уже занят другой поездкой` });
    else report[result.status] += 1;
  }
  return report;
}
