import { sameTrip, tripDay, type Trip } from "@shift-diary/core";

export type DayInfo = { date: string; trips: number };

export type InsertResult =
  | { status: "created"; trip: Trip }
  /** Та же поездка пришла повторно (ретрай клиента) — ничего не меняем. */
  | { status: "replayed"; trip: Trip }
  /** id уже занят другой поездкой — это ошибка клиента, молча не перезаписываем. */
  | { status: "conflict"; existing: Trip };

/** Строка таблицы trips в том виде, в каком её пишут и SQLite, и D1. */
export type TripRow = Trip & { start_ms: number; end_ms: number; day: string };

/**
 * Хранилище поездок. Две реализации: SQLite (локально, тесты) и Cloudflare D1 (демо).
 * Логика идемпотентности живёт не в них, а в addTrip ниже — одна на обе.
 */
export interface TripStore {
  readonly timeZone: string;
  /** INSERT … ON CONFLICT (id) DO NOTHING. true — вставили, false — id уже был. */
  insertIfAbsent(row: TripRow): Promise<boolean>;
  findById(id: string): Promise<Trip | undefined>;
  tripsByDay(day: string): Promise<Trip[]>;
  neighbours(day: string): Promise<{ previous: string | null; next: string | null }>;
  days(): Promise<DayInfo[]>;
  count(): Promise<number>;
}

export const INSERT_SQL = `INSERT INTO trips (id, start, end, start_ms, end_ms, day, amount, payment, commission)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT (id) DO NOTHING`;

export const insertParams = (r: TripRow) => [r.id, r.start, r.end, r.start_ms, r.end_ms, r.day, r.amount, r.payment, r.commission];

export const toTrip = (row: Trip): Trip => ({
  id: row.id,
  start: row.start,
  end: row.end,
  amount: row.amount,
  payment: row.payment,
  commission: row.commission,
});

/**
 * Идемпотентная вставка. Ключ идемпотентности — id поездки, его генерирует клиент
 * до первой отправки, поэтому любой ретрай несёт тот же id.
 * Гонку двух одновременных запросов закрывает PRIMARY KEY + ON CONFLICT DO NOTHING:
 * вставит ровно один, второй получит false и пойдёт сравнивать содержимое.
 */
export async function addTrip(store: TripStore, trip: Trip): Promise<InsertResult> {
  const row: TripRow = {
    ...trip,
    start_ms: Date.parse(trip.start),
    end_ms: Date.parse(trip.end),
    day: tripDay(trip, store.timeZone),
  };
  if (await store.insertIfAbsent(row)) return { status: "created", trip };

  const existing = await store.findById(trip.id);
  if (!existing) throw new Error(`Поездка ${trip.id} не вставилась и не найдена`);
  return sameTrip(existing, trip) ? { status: "replayed", trip: existing } : { status: "conflict", existing };
}
