import type { D1Database } from "@cloudflare/workers-types";
import { DEFAULT_TIME_ZONE, type Trip } from "@shift-diary/core";
import { INSERT_SQL, insertParams, toTrip, type DayInfo, type TripRow, type TripStore } from "./store";

/** Хранилище на Cloudflare D1 (тот же SQLite, но асинхронный и в облаке). */
export class D1Store implements TripStore {
  constructor(
    private readonly db: D1Database,
    readonly timeZone: string = DEFAULT_TIME_ZONE,
  ) {}

  async insertIfAbsent(row: TripRow): Promise<boolean> {
    const result = await this.db.prepare(INSERT_SQL).bind(...insertParams(row)).run();
    return result.meta.changes === 1;
  }

  async findById(id: string): Promise<Trip | undefined> {
    const row = await this.db.prepare(`SELECT * FROM trips WHERE id = ?`).bind(id).first<Trip>();
    return row ? toTrip(row) : undefined;
  }

  async tripsByDay(day: string): Promise<Trip[]> {
    const { results } = await this.db.prepare(`SELECT * FROM trips WHERE day = ? ORDER BY start_ms, id`).bind(day).all<Trip>();
    return results.map(toTrip);
  }

  async neighbours(day: string) {
    const prev = await this.db.prepare(`SELECT MAX(day) AS day FROM trips WHERE day < ?`).bind(day).first<{ day: string | null }>();
    const next = await this.db.prepare(`SELECT MIN(day) AS day FROM trips WHERE day > ?`).bind(day).first<{ day: string | null }>();
    return { previous: prev?.day ?? null, next: next?.day ?? null };
  }

  async days(): Promise<DayInfo[]> {
    const { results } = await this.db
      .prepare(`SELECT day AS date, COUNT(*) AS trips FROM trips GROUP BY day ORDER BY day DESC`)
      .all<DayInfo>();
    return results;
  }

  async count(): Promise<number> {
    return (await this.db.prepare(`SELECT COUNT(*) AS n FROM trips`).first<{ n: number }>())?.n ?? 0;
  }
}
