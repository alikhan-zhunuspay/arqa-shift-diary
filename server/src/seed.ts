import { readFileSync } from "node:fs";
import { parseTrip } from "@shift-diary/core";
import type { TripRepository } from "./repository";

export type SeedReport = { created: number; replayed: number; rejected: { index: number; reason: string }[] };

/**
 * Загружает поездки из JSON через ту же валидацию и ту же идемпотентную вставку, что и API.
 * Повторный запуск ничего не дублирует.
 */
export function seedFromFile(repo: TripRepository, path: string): SeedReport {
  const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(raw)) throw new Error(`${path}: ожидался массив поездок`);

  const report: SeedReport = { created: 0, replayed: 0, rejected: [] };
  raw.forEach((item, index) => {
    const parsed = parseTrip(item);
    if (!parsed.ok) {
      report.rejected.push({ index, reason: parsed.issues.map((i) => `${i.field}: ${i.message}`).join("; ") });
      return;
    }
    const result = repo.insert(parsed.trip);
    if (result.status === "conflict") report.rejected.push({ index, reason: `id ${parsed.trip.id} уже занят другой поездкой` });
    else report[result.status] += 1;
  });
  return report;
}
