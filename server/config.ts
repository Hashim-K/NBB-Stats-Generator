import { resolve } from "node:path";

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function origins(value: string | undefined) {
  const entries = (value ?? "").split(",").map((entry) => entry.trim()).filter(Boolean);
  return entries.length ? new Set(entries.map((entry) => new URL(entry).origin)) : undefined;
}

export type GeneratorServerConfig = ReturnType<typeof serverConfig>;

export function serverConfig() {
  return {
    allowedOrigins: origins(process.env.NBB_ALLOWED_ORIGINS),
    cacheFile: resolve(process.env.NBB_CACHE_FILE ?? ".data/nbb-stats.sqlite"),
    contact: process.env.NBB_CONTACT ?? "https://github.com/Hashim-K/NBB-Stats-Generator",
    host: process.env.HOST ?? "0.0.0.0",
    port: positiveInteger(process.env.PORT, 4173),
    upstreamIntervalMs: Math.max(15_000, positiveInteger(process.env.NBB_UPSTREAM_INTERVAL_MS, 15_000)),
  };
}
