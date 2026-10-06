import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DEFAULT_TIME_ZONE, isValidTimeZone } from "@shift-diary/core";
import { buildApp } from "./app";
import { TripRepository } from "./repository";
import { seedFromFile } from "./seed";

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "0.0.0.0";
const DB_PATH = process.env.DB_PATH ?? "shift-diary.db";
const TIME_ZONE = process.env.TIME_ZONE ?? DEFAULT_TIME_ZONE;
const SEED_FILE = process.env.SEED_FILE ?? fileURLToPath(new URL("../../data/trips.json", import.meta.url));
// Веб-сборка клиента (npm run build). Есть — раздаём сайт вместе с API, нет — работаем только как API.
const WEB_DIR = process.env.WEB_DIR ?? fileURLToPath(new URL("../../app/dist", import.meta.url));

if (!isValidTimeZone(TIME_ZONE)) throw new Error(`Неизвестный часовой пояс: ${TIME_ZONE}`);

const repo = new TripRepository(DB_PATH, TIME_ZONE);
const app = buildApp({ repo, logger: true, webDir: existsSync(WEB_DIR) ? WEB_DIR : undefined });

if (SEED_FILE !== "none") {
  const report = seedFromFile(repo, SEED_FILE);
  app.log.info({ seed: SEED_FILE, ...report }, "Загружены поездки из файла");
}

const shutdown = async () => {
  await app.close();
  repo.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await app.listen({ port: PORT, host: HOST });
