import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";

import { closeDataCache } from "./data";
import { createApiMiddleware } from "./middleware";
import { serverConfig } from "./config";

const config = serverConfig();
const siteRoot = resolve("dist/site");
const api = createApiMiddleware();
const types: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

async function staticFile(pathname: string) {
  const decoded = decodeURIComponent(pathname);
  const candidate = resolve(siteRoot, `.${decoded}`);
  if (candidate !== siteRoot && !candidate.startsWith(`${siteRoot}${sep}`)) return undefined;
  try {
    const info = await stat(candidate);
    return info.isFile() ? candidate : undefined;
  } catch {
    return undefined;
  }
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  if (url.pathname === "/api/nbb-stats") {
    void api(request, response);
    return;
  }
  void (async () => {
    const file = await staticFile(url.pathname) ?? resolve(siteRoot, "index.html");
    response.setHeader("Content-Type", types[extname(file)] ?? "application/octet-stream");
    response.setHeader("X-Content-Type-Options", "nosniff");
    createReadStream(file).on("error", () => {
      response.statusCode = 404;
      response.end("Not found");
    }).pipe(response);
  })();
});

server.listen(config.port, config.host, () => {
  console.log(`NBB Stats Generator listening on http://${config.host}:${config.port}`);
});

async function shutdown() {
  server.close();
  await closeDataCache();
}

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
