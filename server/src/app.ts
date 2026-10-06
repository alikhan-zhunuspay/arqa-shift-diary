import { Hono } from "hono";
import { cors } from "hono/cors";
import { bodyLimit } from "hono/body-limit";
import { isValidDay, parseTrip, summarize } from "@shift-diary/core";
import { addTrip, type TripStore } from "./store";

/**
 * HTTP-слой. Один и тот же код работает в Node (локально, тесты) и в Cloudflare Workers (демо) —
 * отличается только хранилище, которое сюда передают.
 */
export function createApp(store: TripStore) {
  const app = new Hono();

  app.use("/api/*", cors());
  app.use(
    "/api/*",
    bodyLimit({
      maxSize: 16 * 1024,
      onError: (c) => c.json({ error: "bad_request", message: "Слишком большой запрос" }, 413),
    }),
  );

  app.onError((err, c) => {
    console.error(err);
    return c.json({ error: "internal", message: "Внутренняя ошибка сервера" }, 500);
  });

  app.get("/health", (c) => c.json({ ok: true }));

  /** Дни, в которые есть поездки (новые сверху). */
  app.get("/api/days", async (c) => c.json({ timeZone: store.timeZone, days: await store.days() }));

  /** Поездки и сводка за день. Пустой день — это 200 с нулями, а не 404. */
  app.get("/api/days/:date", async (c) => {
    const date = c.req.param("date");
    if (!isValidDay(date)) {
      return c.json({ error: "validation", message: "Дата должна быть в формате YYYY-MM-DD" }, 400);
    }
    const [trips, neighbours] = await Promise.all([store.tripsByDay(date), store.neighbours(date)]);
    return c.json({ date, timeZone: store.timeZone, summary: summarize(trips), trips, neighbours });
  });

  /**
   * Добавление поездки. Идемпотентно по id:
   *  201 — создана;
   *  200 + Idempotent-Replayed: true — такая же поездка уже есть, дубль не создан;
   *  409 — id занят поездкой с другими данными;
   *  400 — не прошла валидацию.
   */
  app.post("/api/trips", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "bad_request", message: "Тело запроса должно быть JSON" }, 400);
    }

    const parsed = parseTrip(body);
    if (!parsed.ok) {
      return c.json({ error: "validation", message: "Поездка не прошла проверку", issues: parsed.issues }, 400);
    }

    const result = await addTrip(store, parsed.trip);
    switch (result.status) {
      case "created":
        return c.json({ trip: result.trip }, 201);
      case "replayed":
        c.header("Idempotent-Replayed", "true");
        return c.json({ trip: result.trip }, 200);
      case "conflict":
        return c.json(
          {
            error: "conflict",
            message: `Поездка с id "${parsed.trip.id}" уже существует с другими данными`,
            existing: result.existing,
          },
          409,
        );
    }
  });

  app.notFound((c) => c.json({ error: "not_found", message: "Маршрут не найден" }, 404));

  return app;
}
