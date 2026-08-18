import type { IncomingMessage, ServerResponse } from "node:http";

import { handleApiRequest } from "./api";

type Next = (error?: unknown) => void;
const apiPaths = new Set(["/api/nbb-options", "/api/nbb-stats"]);

function requestUrl(request: IncomingMessage) {
  const host = request.headers.host ?? "localhost";
  return new URL(request.url ?? "/", `http://${host}`);
}

function clientAddress(request: IncomingMessage) {
  const cloudflare = request.headers["cf-connecting-ip"];
  if (typeof cloudflare === "string") return cloudflare;
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0]!.trim();
  return request.socket.remoteAddress ?? "unknown";
}

async function send(response: Response, target: ServerResponse) {
  target.statusCode = response.status;
  response.headers.forEach((value, name) => target.setHeader(name, value));
  if (!response.body) { target.end(); return; }
  target.end(Buffer.from(await response.arrayBuffer()));
}

export function createApiMiddleware() {
  return async (request: IncomingMessage, response: ServerResponse, next?: Next) => {
    try {
      const url = requestUrl(request);
      if (!apiPaths.has(url.pathname)) { next?.(); return; }
      const webRequest = new Request(url, {
        method: request.method,
        headers: request.headers as HeadersInit,
      });
      await send(await handleApiRequest(webRequest, clientAddress(request)), response);
    } catch (error) {
      if (next) next(error);
      else {
        response.statusCode = 500;
        response.end("Internal server error");
      }
    }
  };
}
