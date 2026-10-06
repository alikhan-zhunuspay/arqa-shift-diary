import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { isValidDay, parseTrip, summarize } from "@shift-diary/core";
import type { TripRepository } from "./repository";

export type AppOptions = {
  repo: TripRepository;
  logger?: boolean;
  /** Папка с веб-сборкой клиента (expo export). Если задана — сайт и API живут по одному адресу. */
  webDir?: string;
};

export function buildApp({ repo, logger = false, webDir }: AppOptions): FastifyInstance {
  const app = Fastify({ logger });

  void app.register(cors, { origin: true });
  if (webDir) void app.register(fastifyStatic, { root: webDir });

  // Единый формат ошибок, в т. ч. для битого JSON и неизвестных маршрутов.
  app.setErrorHandler((error: { statusCode?: number; message: string }, request, reply) => {
    const status = error.statusCode ?? 500;
    if (status >= 500) request.log.error(error);
    return reply.status(status).send({
      error: status >= 500 ? "internal" : "bad_request",
      message: status >= 500 ? "Внутренняя ошибка сервера" : error.message,
    });
  });
  app.setNotFoundHandler((request, reply) => {
    // Клиент — одностраничное приложение: любые не-API адреса отдаём его index.html.
    if (webDir && request.method === "GET" && !request.url.startsWith("/api/")) return reply.sendFile("index.html");
    return reply.status(404).send({ error: "not_found", message: "Маршрут не найден" });
  });

  app.get("/health", async () => ({ ok: true }));

  /** Дни, в которые есть поездки (новые сверху). */
  app.get("/api/days", async () => ({ timeZone: repo.timeZone, days: repo.days() }));

  /** Поездки и сводка за день. Пустой день — это 200 с нулями, а не 404. */
  app.get<{ Params: { date: string } }>("/api/days/:date", async (request, reply) => {
    const { date } = request.params;
    if (!isValidDay(date)) {
      return reply.status(400).send({ error: "validation", message: "Дата должна быть в формате YYYY-MM-DD" });
    }
    const trips = repo.tripsByDay(date);
    return {
      date,
      timeZone: repo.timeZone,
      summary: summarize(trips),
      trips,
      neighbours: repo.neighbours(date),
    };
  });

  /**
   * Добавление поездки. Идемпотентно по id:
   *  201 — создана;
   *  200 + Idempotent-Replayed: true — такая же поездка уже есть, дубль не создан;
   *  409 — id занят поездкой с другими данными;
   *  400 — не прошла валидацию.
   */
  app.post("/api/trips", async (request, reply) => {
    const parsed = parseTrip(request.body);
    if (!parsed.ok) {
      return reply.status(400).send({ error: "validation", message: "Поездка не прошла проверку", issues: parsed.issues });
    }

    const result = repo.insert(parsed.trip);
    switch (result.status) {
      case "created":
        return reply.status(201).send({ trip: result.trip });
      case "replayed":
        return reply.status(200).header("Idempotent-Replayed", "true").send({ trip: result.trip });
      case "conflict":
        return reply.status(409).send({
          error: "conflict",
          message: `Поездка с id "${parsed.trip.id}" уже существует с другими данными`,
          existing: result.existing,
        });
    }
  });

  return app;
}
