import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { D1Database } from "@cloudflare/workers-types";
import { createApp } from "../src/app";
import { addTrip, type TripStore } from "../src/store";
import { SqliteStore } from "../src/sqlite-store";
import { D1Store } from "../src/d1-store";
import { seedTrips } from "../src/seed";
import { serveWeb } from "../src/web";
import demoTrips from "../../data/trips.json";

const t1 = {
  id: "t1",
  start: "2026-10-01T08:10:00+05:00",
  end: "2026-10-01T08:32:00+05:00",
  amount: 2400,
  payment: "card",
  commission: 360,
};
const t2 = {
  id: "t2",
  start: "2026-10-01T09:05:00+05:00",
  end: "2026-10-01T09:20:00+05:00",
  amount: 1500,
  payment: "cash",
  commission: 225,
};

/**
 * D1 поверх локального SQLite: тот же движок и тот же SQL, но через асинхронный API D1.
 * Так весь набор тестов проверяет и хранилище, на котором работает демо в Cloudflare.
 */
function d1OverSqlite(db: DatabaseSync): D1Database {
  return {
    prepare(sql: string) {
      let params: unknown[] = [];
      const stmt = {
        bind(...values: unknown[]) {
          params = values;
          return stmt;
        },
        async run() {
          const { changes } = db.prepare(sql).run(...(params as never[]));
          return { success: true, results: [], meta: { changes: Number(changes) } };
        },
        async first() {
          return db.prepare(sql).get(...(params as never[])) ?? null;
        },
        async all() {
          return { success: true, results: db.prepare(sql).all(...(params as never[])), meta: {} };
        },
      };
      return stmt;
    },
  } as unknown as D1Database;
}

const STORES: { name: string; make: () => TripStore & { close?: () => void } }[] = [
  { name: "SQLite", make: () => new SqliteStore(":memory:") },
  {
    name: "D1",
    make: () => {
      // Тот же файл миграции, что применяет wrangler к настоящей D1.
      const db = new DatabaseSync(":memory:");
      db.exec(readSchema());
      return new D1Store(d1OverSqlite(db));
    },
  },
];

function readSchema(): string {
  return readFileSync(new URL("../migrations/0001_init.sql", import.meta.url), "utf8");
}

type Res = { statusCode: number; headers: Record<string, string>; body: string; json: () => any };

let store: TripStore & { close?: () => void };
let app: ReturnType<typeof createApp>;

async function inject(method: string, url: string, payload?: unknown): Promise<Res> {
  const init: RequestInit = { method };
  if (payload !== undefined) {
    init.body = typeof payload === "string" ? payload : JSON.stringify(payload);
    init.headers = { "content-type": "application/json" };
  }
  const response = await app.request(url, init);
  const body = await response.text();
  return { statusCode: response.status, headers: Object.fromEntries(response.headers), body, json: () => JSON.parse(body) };
}

const post = (body: unknown) => inject("POST", "/api/trips", body);
const day = (date: string) => inject("GET", `/api/days/${date}`);

describe.each(STORES)("хранилище $name", ({ make }) => {
  beforeEach(() => {
    store = make();
    app = createApp(store);
  });
  afterEach(() => store.close?.());

  describe("GET /api/days/:date", () => {
    it("отдаёт поездки и сводку за день (пример из вакансии)", async () => {
      await post(t2);
      await post(t1);
      const res = await day("2026-10-01");
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.trips.map((t: { id: string }) => t.id)).toEqual(["t1", "t2"]); // по времени начала
      expect(body.summary).toEqual({
        trips: 2,
        revenue: 3900,
        commission: 585,
        net: 3315,
        byPayment: { cash: { count: 1, amount: 1500 }, card: { count: 1, amount: 2400 } },
      });
    });

    it("пустой день — 200 и нули", async () => {
      const res = await day("2026-01-01");
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ trips: [], summary: { trips: 0, revenue: 0, net: 0 } });
    });

    it("не путает дни: другой день не попадает в выборку", async () => {
      await post(t1);
      await post({ ...t2, id: "next", start: "2026-10-02T09:05:00+05:00", end: "2026-10-02T09:20:00+05:00" });
      expect((await day("2026-10-01")).json().summary.trips).toBe(1);
      expect((await day("2026-10-02")).json().summary.trips).toBe(1);
    });

    it("день считается по Алматы: 20:30 UTC — это уже следующий день", async () => {
      await post({ ...t1, start: "2026-10-01T20:30:00Z", end: "2026-10-01T20:50:00Z" });
      expect((await day("2026-10-01")).json().trips).toHaveLength(0);
      expect((await day("2026-10-02")).json().trips).toHaveLength(1);
    });

    it("поездка через полночь — в дне начала", async () => {
      await post({ ...t1, start: "2026-10-01T23:50:00+05:00", end: "2026-10-02T00:15:00+05:00" });
      expect((await day("2026-10-01")).json().trips).toHaveLength(1);
      expect((await day("2026-10-02")).json().trips).toHaveLength(0);
    });

    it("подсказывает соседние дни с поездками", async () => {
      await post({ ...t1, id: "a", start: "2026-09-28T08:00:00+05:00", end: "2026-09-28T08:20:00+05:00" });
      await post({ ...t1, id: "b", start: "2026-10-05T08:00:00+05:00", end: "2026-10-05T08:20:00+05:00" });
      expect((await day("2026-10-01")).json().neighbours).toEqual({ previous: "2026-09-28", next: "2026-10-05" });
    });

    it.each(["2026-13-01", "01.10.2026", "today"])("400 на неверную дату %s", async (date) => {
      expect((await day(date)).statusCode).toBe(400);
    });
  });

  describe("POST /api/trips — защита от дублей", () => {
    it("первая отправка создаёт поездку", async () => {
      const res = await post(t1);
      expect(res.statusCode).toBe(201);
      expect(res.json().trip).toEqual(t1);
    });

    it("повторная отправка той же поездки не создаёт дубль", async () => {
      await post(t1);
      const retry = await post(t1);
      expect(retry.statusCode).toBe(200);
      expect(retry.headers["idempotent-replayed"]).toBe("true");
      expect(retry.json().trip).toEqual(t1);

      const body = (await day("2026-10-01")).json();
      expect(body.trips).toHaveLength(1);
      expect(body.summary.revenue).toBe(2400); // выручка не удвоилась
    });

    it("десять одновременных повторов — ровно одна поездка", async () => {
      const results = await Promise.all(Array.from({ length: 10 }, () => post(t1)));
      const codes = results.map((r) => r.statusCode).sort();
      expect(codes.filter((c) => c === 201)).toHaveLength(1);
      expect(codes.filter((c) => c === 200)).toHaveLength(9);
      expect((await day("2026-10-01")).json().trips).toHaveLength(1);
    });

    it("тот же момент в другой записи (Z вместо +05:00) — тоже повтор, а не конфликт", async () => {
      await post(t1);
      const retry = await post({ ...t1, start: "2026-10-01T03:10:00Z", end: "2026-10-01T03:32:00Z" });
      expect(retry.statusCode).toBe(200);
    });

    it("тот же id с другими данными — 409, исходная поездка не перезаписана", async () => {
      await post(t1);
      const res = await post({ ...t1, amount: 9999 });
      expect(res.statusCode).toBe(409);
      expect(res.json()).toMatchObject({ error: "conflict", existing: { amount: 2400 } });
      expect((await day("2026-10-01")).json().summary.revenue).toBe(2400);
    });

    it("разные id с одинаковыми данными — это две разные поездки", async () => {
      await post(t1);
      expect((await post({ ...t1, id: "t1-bis" })).statusCode).toBe(201);
      expect((await day("2026-10-01")).json().trips).toHaveLength(2);
    });

  });

  describe("POST /api/trips — валидация", () => {
    it.each([
      ["сумма 0", { ...t1, amount: 0 }, "amount"],
      ["отрицательная сумма", { ...t1, amount: -5 }, "amount"],
      ["окончание раньше начала", { ...t1, end: "2026-10-01T08:00:00+05:00" }, "end"],
      ["окончание равно началу", { ...t1, end: t1.start }, "end"],
      ["неизвестный способ оплаты", { ...t1, payment: "kaspi" }, "payment"],
      ["комиссия больше суммы", { ...t1, commission: 5000 }, "commission"],
      ["нет id", { ...t1, id: undefined }, "id"],
    ])("400: %s", async (_name, body, field) => {
      const res = await post(body);
      expect(res.statusCode).toBe(400);
      expect(res.json().issues.map((i: { field: string }) => i.field)).toContain(field);
    });

    it("невалидная поездка ничего не записывает", async () => {
      await post({ ...t1, amount: 0 });
      expect((await day("2026-10-01")).json().trips).toHaveLength(0);
    });

    it("битый JSON — 400 в общем формате ошибок", async () => {
      const res = await inject("POST", "/api/trips", "{not json");
      expect(res.statusCode).toBe(400);
      expect(res.json()).toHaveProperty("message");
    });
  });

  describe("загрузка демо-данных", () => {
    it("грузит data/trips.json и повторный запуск ничего не дублирует", async () => {
      const first = await seedTrips(store, demoTrips);
      expect(first.rejected).toEqual([]);
      expect(first.created).toBe(demoTrips.length);
      const second = await seedTrips(store, demoTrips);
      expect(second).toEqual({ created: 0, replayed: first.created, rejected: [] });
      expect((await store.tripsByDay("2026-10-01")).map((t) => t.id)).toEqual(["t1", "t2"]);
    });
  });
});

describe("только SQLite", () => {
  it("дубли переживают перезапуск: повтор после рестарта сервера не дублирует", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "shift-diary-")), "test.db");
    const s1 = new SqliteStore(path);
    expect((await addTrip(s1, t1 as never)).status).toBe("created");
    s1.close();
    const s2 = new SqliteStore(path);
    expect((await addTrip(s2, t1 as never)).status).toBe("replayed");
    expect(await s2.tripsByDay("2026-10-01")).toHaveLength(1);
    s2.close();
  });

  it("раздаёт веб-версию: index.html на любые не-API адреса, API — как раньше", async () => {
    const webDir = mkdtempSync(join(tmpdir(), "shift-web-"));
    writeFileSync(join(webDir, "index.html"), "<!doctype html><title>Дневник смен</title>");
    store = new SqliteStore(":memory:");
    app = createApp(store);
    serveWeb(app, webDir);

    expect((await inject("GET", "/")).body).toContain("Дневник смен");
    expect((await inject("GET", "/any/client/route")).body).toContain("Дневник смен");
    expect((await inject("GET", "/api/days/2026-10-01")).json()).toHaveProperty("summary");
    expect((await inject("GET", "/api/unknown")).statusCode).toBe(404);
    store.close?.();
  });
});
