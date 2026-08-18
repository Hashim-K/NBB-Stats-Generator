import { createHash } from "node:crypto";

import { isCacheMiss, selectionOptions, widgetData } from "./data";
import { serverConfig } from "./config";
import { browserRequestGate, rateLimit } from "./security";

const config = serverConfig();

function json(status: number, payload: unknown, headers: HeadersInit = {}) {
  return Response.json(payload, {
    status,
    headers: {
      "Cache-Control": status >= 400 ? "no-store" : "public, max-age=300",
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}

export async function handleApiRequest(request: Request, clientAddress = "unknown") {
  if (request.method !== "GET" && request.method !== "HEAD" && request.method !== "OPTIONS") {
    return json(405, { error: "Only GET, HEAD, and OPTIONS are supported" }, { Allow: "GET, HEAD, OPTIONS" });
  }

  const gate = browserRequestGate(request, config);
  if (!gate.allowed) return json(403, { error: gate.reason }, gate.cors);
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        ...gate.cors,
        "Access-Control-Allow-Headers": "Accept, Content-Type",
        "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  const limit = rateLimit(clientAddress);
  if (!limit.allowed) {
    return json(429, { error: "Too many widget requests from this client" }, {
      ...gate.cors,
      "Retry-After": String(limit.retryAfter),
    });
  }

  try {
    const url = new URL(request.url);
    const refresh = gate.crawler ? "cache-only" : "wait";
    const payload = url.pathname === "/api/nbb-options"
      ? await selectionOptions(url.searchParams, refresh)
      : await widgetData(url.searchParams, refresh);
    const body = JSON.stringify(payload);
    const etag = `"${createHash("sha256").update(body).digest("base64url")}"`;
    const refreshAfter = payload.meta.refreshAfter;
    const historical = refreshAfter === null;
    const maxAge = refreshAfter === null
      ? 31_536_000
      : Math.max(300, Math.min(86_400, Math.floor((Date.parse(refreshAfter) - Date.now()) / 1_000)));
    const headers = {
      ...gate.cors,
      "Cache-Control": historical
        ? "public, max-age=31536000, immutable"
        : `public, max-age=${maxAge}, stale-while-revalidate=604800`,
      "Content-Type": "application/json; charset=utf-8",
      ETag: etag,
      "X-Content-Type-Options": "nosniff",
      "X-NBB-Cache": "persistent-nbb-stats",
      "X-NBB-Refresh-After": payload.meta.refreshAfter ?? "never",
      "X-Robots-Tag": "noindex, nofollow",
    };
    if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
    return new Response(request.method === "HEAD" ? null : body, { status: 200, headers });
  } catch (error) {
    if (isCacheMiss(error)) {
      return json(503, { error: "Crawler cache miss; no upstream request was sent" }, {
        ...gate.cors,
        "Retry-After": "3600",
      });
    }
    const message = error instanceof Error ? error.message : "Unexpected gateway error";
    const status = error instanceof TypeError || error instanceof RangeError ? 400 : 503;
    return json(status, { error: message }, gate.cors);
  }
}
