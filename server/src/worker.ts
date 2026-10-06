import type { D1Database } from "@cloudflare/workers-types";
import { DEFAULT_TIME_ZONE } from "@shift-diary/core";
import { createApp } from "./app";
import { D1Store } from "./d1-store";
import { seedTrips } from "./seed";
import trips from "../../data/trips.json";

type Env = {
  DB: D1Database;
  TIME_ZONE?: string;
  /** Есть в Cloudflare Pages: отдаёт файлы веб-сборки (с фолбэком на index.html). */
  ASSETS?: { fetch(request: Request): Promise<Response> };
};

/**
 * Cloudflare (Pages или Workers): тот же HTTP-слой, что и в Node, но поверх D1.
 * Сюда приходят все запросы; не-API отдаём файлами веб-версии через ASSETS.
 */
let seeded: Promise<void> | null = null;

export default {
  async fetch(request: Request, env: Env, ctx: unknown): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (env.ASSETS && !pathname.startsWith("/api/") && pathname !== "/health") return env.ASSETS.fetch(request);

    const store = new D1Store(env.DB, env.TIME_ZONE ?? DEFAULT_TIME_ZONE);

    // Пустая база (первый запуск демо) — один раз загружаем data/trips.json.
    // Загрузка идемпотентна, поэтому параллельные первые запросы ничего не задвоят.
    seeded ??= store.count().then(async (n) => {
      if (n === 0) await seedTrips(store, trips);
    });
    await seeded.catch(() => (seeded = null));

    return createApp(store).fetch(request, env, ctx as never);
  },
};
