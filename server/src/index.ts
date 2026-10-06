import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { DEFAULT_TIME_ZONE, isValidTimeZone } from "@shift-diary/core";
import { createApp } from "./app";
import { SqliteStore } from "./sqlite-store";
import { seedTrips } from "./seed";
import { serveWeb } from "./web";

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "0.0.0.0";
const DB_PATH = process.env.DB_PATH ?? "shift-diary.db";
const TIME_ZONE = process.env.TIME_ZONE ?? DEFAULT_TIME_ZONE;
const SEED_FILE = process.env.SEED_FILE ?? fileURLToPath(new URL("../../data/trips.json", import.meta.url));
// Веб-сборка клиента (npm run build). Есть — раздаём сайт вместе с API, нет — работаем только как API.
const WEB_DIR = process.env.WEB_DIR ?? fileURLToPath(new URL("../../app/dist", import.meta.url));

if (!isValidTimeZone(TIME_ZONE)) throw new Error(`Неизвестный часовой пояс: ${TIME_ZONE}`);

const store = new SqliteStore(DB_PATH, TIME_ZONE);
const app = createApp(store);
if (existsSync(WEB_DIR)) serveWeb(app, WEB_DIR);

if (SEED_FILE !== "none") {
  const report = await seedTrips(store, JSON.parse(readFileSync(SEED_FILE, "utf8")));
  console.log(`Загружены поездки из ${SEED_FILE}:`, report);
}

const server = serve({ fetch: app.fetch, port: PORT, hostname: HOST }, (info) => {
  console.log(`API: http://localhost:${info.port}${existsSync(WEB_DIR) ? " (вместе с веб-версией)" : ""}`);
});

const shutdown = () => {
  server.close();
  store.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
