import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { DEFAULT_TIME_ZONE, type Trip } from "@shift-diary/core";
import { INSERT_SQL, insertParams, toTrip, type DayInfo, type TripRow, type TripStore } from "./store";

const SCHEMA = readFileSync(new URL("../migrations/0001_init.sql", import.meta.url), "utf8");

/** Локальное хранилище на встроенном node:sqlite — для разработки и тестов. */
export class SqliteStore implements TripStore {
  private readonly db: DatabaseSync;

  constructor(
    path: string,
    readonly timeZone: string = DEFAULT_TIME_ZONE,
  ) {
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec(SCHEMA);
  }

  async insertIfAbsent(row: TripRow): Promise<boolean> {
    return this.db.prepare(INSERT_SQL).run(...insertParams(row)).changes === 1;
  }

  async findById(id: string): Promise<Trip | undefined> {
    const row = this.db.prepare(`SELECT * FROM trips WHERE id = ?`).get(id) as Trip | undefined;
    return row && toTrip(row);
  }

  async tripsByDay(day: string): Promise<Trip[]> {
    return (this.db.prepare(`SELECT * FROM trips WHERE day = ? ORDER BY start_ms, id`).all(day) as Trip[]).map(toTrip);
  }

  async neighbours(day: string) {
    const prev = this.db.prepare(`SELECT MAX(day) AS day FROM trips WHERE day < ?`).get(day) as { day: string | null };
    const next = this.db.prepare(`SELECT MIN(day) AS day FROM trips WHERE day > ?`).get(day) as { day: string | null };
    return { previous: prev.day, next: next.day };
  }

  async days(): Promise<DayInfo[]> {
    return this.db.prepare(`SELECT day AS date, COUNT(*) AS trips FROM trips GROUP BY day ORDER BY day DESC`).all() as DayInfo[];
  }

  async count(): Promise<number> {
    return (this.db.prepare(`SELECT COUNT(*) AS n FROM trips`).get() as { n: number }).n;
  }

  close(): void {
    this.db.close();
  }
}
