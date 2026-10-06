-- Одна схема для локального SQLite и Cloudflare D1.
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
