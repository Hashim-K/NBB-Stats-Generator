import type { WidgetResponse } from "./types";

type CacheEnvelope = {
  version: 1;
  payload: WidgetResponse;
  storedAt: number;
  refreshAfter: number | null;
};

export type BrowserCacheHit = {
  fresh: boolean;
  payload: WidgetResponse;
};

const STALE_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;

function hash(value: string) {
  let result = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 0x01000193);
  }
  return (result >>> 0).toString(36);
}

function storageOrUndefined(storage?: Storage) {
  if (storage) return storage;
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export function responseCacheKey(url: string) {
  return `nbb-stats-generator:response:v1:${hash(url)}`;
}

export function readResponseCache(
  url: string,
  options: { now?: number; storage?: Storage } = {},
): BrowserCacheHit | undefined {
  const storage = storageOrUndefined(options.storage);
  if (!storage) return undefined;
  try {
    const raw = storage.getItem(responseCacheKey(url));
    if (!raw) return undefined;
    const entry = JSON.parse(raw) as Partial<CacheEnvelope>;
    if (
      entry.version !== 1
      || !entry.payload
      || typeof entry.storedAt !== "number"
      || (entry.refreshAfter !== null && typeof entry.refreshAfter !== "number")
    ) {
      storage.removeItem(responseCacheKey(url));
      return undefined;
    }
    const now = options.now ?? Date.now();
    if (entry.refreshAfter !== null && entry.refreshAfter + STALE_RETENTION_MS <= now) {
      storage.removeItem(responseCacheKey(url));
      return undefined;
    }
    return {
      fresh: entry.refreshAfter === null || entry.refreshAfter > now,
      payload: entry.payload,
    };
  } catch {
    return undefined;
  }
}

export function writeResponseCache(
  url: string,
  payload: WidgetResponse,
  options: { now?: number; storage?: Storage } = {},
) {
  const storage = storageOrUndefined(options.storage);
  if (!storage) return false;
  const now = options.now ?? Date.now();
  const parsedRefresh = payload.meta.refreshAfter === null
    ? null
    : Date.parse(payload.meta.refreshAfter);
  const refreshAfter = parsedRefresh === null || Number.isFinite(parsedRefresh)
    ? parsedRefresh
    : now + 15 * 60 * 1_000;
  const envelope: CacheEnvelope = {
    version: 1,
    payload,
    storedAt: now,
    refreshAfter,
  };
  try {
    storage.setItem(responseCacheKey(url), JSON.stringify(envelope));
    return true;
  } catch {
    return false;
  }
}
