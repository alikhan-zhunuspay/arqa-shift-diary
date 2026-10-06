import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app";
import { TripRepository } from "../src/repository";
import { seedFromFile } from "../src/seed";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

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

let repo: TripRepository;
let app: FastifyInstance;

beforeEach(() => {
  repo = new TripRepository(":memory:");
  app = buildApp({ repo });
});
afterEach(async () => {
  await app.close();
  repo.close();
});

const post = (body: unknown) => app.inject({ method: "POST", url: "/api/trips", payload: body as object });
const day = (date: string) => app.inject({ method: "GET", url: `/api/days/${date}` });

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

  it("дубли переживают перезапуск: повтор после рестарта сервера не дублирует", () => {
    const path = join(mkdtempSync(join(tmpdir(), "shift-diary-")), "test.db");
    const r1 = new TripRepository(path);
    expect(r1.insert(t1 as never).status).toBe("created");
    r1.close();
    const r2 = new TripRepository(path);
    expect(r2.insert(t1 as never).status).toBe("replayed");
    expect(r2.tripsByDay("2026-10-01")).toHaveLength(1);
    r2.close();
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
    const res = await app.inject({
      method: "POST",
      url: "/api/trips",
      headers: { "content-type": "application/json" },
      payload: "{not json",
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toHaveProperty("message");
  });
});

describe("загрузка из файла", () => {
  it("грузит data/trips.json и повторный запуск ничего не дублирует", () => {
    const file = fileURLToPath(new URL("../../data/trips.json", import.meta.url));
    const first = seedFromFile(repo, file);
    expect(first.rejected).toEqual([]);
    expect(first.created).toBeGreaterThan(0);
    const second = seedFromFile(repo, file);
    expect(second).toEqual({ created: 0, replayed: first.created, rejected: [] });
    expect(repo.tripsByDay("2026-10-01").map((t) => t.id)).toEqual(["t1", "t2"]);
  });
});

describe("раздача веб-версии", () => {
  it("отдаёт index.html на любые не-API адреса, API — как раньше", async () => {
    const webDir = mkdtempSync(join(tmpdir(), "shift-web-"));
    writeFileSync(join(webDir, "index.html"), "<!doctype html><title>Дневник смен</title>");
    const web = buildApp({ repo, webDir });

    expect((await web.inject({ url: "/" })).body).toContain("Дневник смен");
    expect((await web.inject({ url: "/any/client/route" })).body).toContain("Дневник смен");
    expect((await web.inject({ url: "/api/days/2026-10-01" })).json()).toHaveProperty("summary");
    expect((await web.inject({ url: "/api/unknown" })).statusCode).toBe(404);
    await web.close();
  });
});
