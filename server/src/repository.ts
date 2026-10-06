import { DatabaseSync } from "node:sqlite";
import { DEFAULT_TIME_ZONE, sameTrip, tripDay, type Trip } from "@shift-diary/core";

export type InsertResult =
  | { status: "created"; trip: Trip }
  /** Та же поездка пришла повторно (ретрай клиента) — ничего не меняем. */
  | { status: "replayed"; trip: Trip }
  /** id уже занят другой поездкой — это ошибка клиента, молча не перезаписываем. */
  | { status: "conflict"; existing: Trip };

export type DayInfo = { date: string; trips: number };

type TripRow = {
  id: string;
  start: string;
  end: string;
  amount: number;
  payment: Trip["payment"];
  commission: number;
};

const toTrip = (row: TripRow): Trip => ({
  id: row.id,
  start: row.start,
  end: row.end,
  amount: row.amount,
  payment: row.payment,
  commission: row.commission,
});

export class TripRepository {
  private readonly db: DatabaseSync;

  constructor(
    path: string,
    readonly timeZone: string = DEFAULT_TIME_ZONE,
  ) {
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS trips (
        id         TEXT PRIMARY KEY,
        start      TEXT    NOT NULL,
        end        TEXT    NOT NULL,
        start_ms   INTEGER NOT NULL,
        end_ms     INTEGER NOT NULL,
        day        TEXT    NOT NULL,
        amount     INTEGER NOT NULL CHECK (amount > 0),
        payment    TEXT    NOT NULL CHECK (payment IN ('cash', 'card')),
        commission INTEGER NOT NULL CHECK (commission >= 0 AND commission <= amount),
        created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        CHECK (end_ms > start_ms)
      );
      CREATE INDEX IF NOT EXISTS trips_day ON trips (day, start_ms);
    `);
  }

  /**
   * Идемпотентная вставка. Ключ идемпотентности — id поездки, его генерирует клиент
   * до первой отправки, поэтому любой ретрай несёт тот же id.
   * Гонку двух одновременных запросов закрывает PRIMARY KEY + ON CONFLICT DO NOTHING:
   * вставит ровно один, второй увидит changes = 0 и пойдёт сравнивать.
   */
  insert(trip: Trip): InsertResult {
    const { changes } = this.db
      .prepare(
        `INSERT INTO trips (id, start, end, start_ms, end_ms, day, amount, payment, commission)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO NOTHING`,
      )
      .run(
        trip.id,
        trip.start,
        trip.end,
        Date.parse(trip.start),
        Date.parse(trip.end),
        tripDay(trip, this.timeZone),
        trip.amount,
        trip.payment,
        trip.commission,
      );

    if (changes === 1) return { status: "created", trip };

    const existing = this.findById(trip.id);
    if (!existing) throw new Error(`Поездка ${trip.id} не вставилась и не найдена`);
    return sameTrip(existing, trip) ? { status: "replayed", trip: existing } : { status: "conflict", existing };
  }

  findById(id: string): Trip | undefined {
    const row = this.db.prepare(`SELECT * FROM trips WHERE id = ?`).get(id) as TripRow | undefined;
    return row && toTrip(row);
  }

  tripsByDay(day: string): Trip[] {
    const rows = this.db.prepare(`SELECT * FROM trips WHERE day = ? ORDER BY start_ms, id`).all(day) as TripRow[];
    return rows.map(toTrip);
  }

  /** Ближайшие дни с поездками до и после выбранного — для навигации в клиенте. */
  neighbours(day: string): { previous: string | null; next: string | null } {
    const prev = this.db.prepare(`SELECT MAX(day) AS day FROM trips WHERE day < ?`).get(day) as { day: string | null };
    const next = this.db.prepare(`SELECT MIN(day) AS day FROM trips WHERE day > ?`).get(day) as { day: string | null };
    return { previous: prev.day, next: next.day };
  }

  days(): DayInfo[] {
    return this.db
      .prepare(`SELECT day AS date, COUNT(*) AS trips FROM trips GROUP BY day ORDER BY day DESC`)
      .all() as DayInfo[];
  }

  close(): void {
    this.db.close();
  }
}
