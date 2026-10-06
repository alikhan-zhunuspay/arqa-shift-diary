import type { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";

/**
 * Node: раздаём веб-сборку клиента тем же сервером, что и API.
 * Любой не-API адрес получает index.html (одностраничное приложение).
 * В Cloudflare то же самое делает сама платформа (assets в wrangler.toml).
 */
export function serveWeb(app: Hono, webDir: string): void {
  app.use("*", serveStatic({ root: webDir }));
  app.get("*", (c, next) => (c.req.path.startsWith("/api/") ? next() : serveStatic({ root: webDir, path: "index.html" })(c, next)));
}
