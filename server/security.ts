import { isLikelyCrawler } from "nbb-stats";

import type { GeneratorServerConfig } from "./config";

type GateResult = {
  allowed: boolean;
  cors: Record<string, string>;
  crawler: boolean;
  reason?: string;
};

const rateWindows = new Map<string, { count: number; resetAt: number }>();
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 12;

function validOrigin(value: string | null) {
  if (!value || value === "null") return undefined;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.origin : undefined;
  } catch {
    return undefined;
  }
}

export function browserRequestGate(request: Request, config: GeneratorServerConfig): GateResult {
  const origin = validOrigin(request.headers.get("origin"));
  const mode = request.headers.get("sec-fetch-mode");
  const site = request.headers.get("sec-fetch-site");
  const destination = request.headers.get("sec-fetch-dest");
  const userAgent = request.headers.get("user-agent") ?? "";
  const sameOrigin = site === "same-origin" || site === "same-site";
  const browserSignals = ["cors", "same-origin"].includes(mode ?? "")
    && ["cross-site", "same-origin", "same-site"].includes(site ?? "")
    && (destination === "empty" || destination === null);

  if (!userAgent) return { allowed: false, cors: {}, crawler: false, reason: "A browser User-Agent is required" };
  if (!origin && !sameOrigin) {
    return { allowed: false, cors: {}, crawler: isLikelyCrawler(userAgent), reason: "A browser Origin or same-origin fetch is required" };
  }
  if (!browserSignals) {
    return { allowed: false, cors: {}, crawler: isLikelyCrawler(userAgent), reason: "Browser Fetch Metadata headers are required" };
  }
  if (origin && config.allowedOrigins && !config.allowedOrigins.has(origin)) {
    return { allowed: false, cors: {}, crawler: isLikelyCrawler(userAgent), reason: "Origin is not registered" };
  }
  return {
    allowed: true,
    crawler: isLikelyCrawler(userAgent),
    cors: origin
      ? {
          "Access-Control-Allow-Origin": origin,
          Vary: "Origin, Accept-Encoding",
        }
      : { Vary: "Accept-Encoding" },
  };
}

export function rateLimit(clientAddress: string, now = Date.now()) {
  const current = rateWindows.get(clientAddress);
  if (!current || current.resetAt <= now) {
    rateWindows.set(clientAddress, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return { allowed: true, retryAfter: 0 };
  }
  current.count += 1;
  return {
    allowed: current.count <= RATE_LIMIT,
    retryAfter: Math.max(1, Math.ceil((current.resetAt - now) / 1_000)),
  };
}

export function clearRateLimits() {
  rateWindows.clear();
}
