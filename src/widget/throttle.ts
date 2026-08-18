const DEFAULT_INTERVAL_MS = 15_000;
const documentQueues = new Map<string, Promise<unknown>>();

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

export function requestScope(url: string) {
  const parsed = new URL(url, globalThis.location?.href ?? "http://localhost");
  const hostname = parsed.hostname.toLowerCase();
  // Games and standings currently use different Basketballstats subdomains;
  // they deliberately share one source-wide request budget.
  if (hostname === "basketballstats.nl" || hostname.endsWith(".basketballstats.nl")) {
    return "basketballstats.nl";
  }
  return parsed.origin;
}

function requestScopeKey(url: string) {
  return hash(requestScope(url));
}

export function requestTimestampKey(url: string) {
  return `nbb-stats-generator:last-request:v1:${requestScopeKey(url)}`;
}

function sleep(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

export async function reserveBrowserRequestSlot(
  url: string,
  options: {
    intervalMs?: number;
    now?: () => number;
    sleep?: (milliseconds: number) => Promise<void>;
    storage?: Storage;
  } = {},
) {
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const now = options.now ?? Date.now;
  const wait = options.sleep ?? sleep;
  const storage = storageOrUndefined(options.storage);
  if (!storage) return;

  const key = requestTimestampKey(url);
  const stored = storage.getItem(key);
  const parsed = stored === null ? Number.NaN : Number(stored);
  const current = now();
  const previous = Number.isFinite(parsed) && parsed <= current + intervalMs
    ? parsed
    : undefined;
  const remaining = previous === undefined
    ? 0
    : Math.max(0, intervalMs - (current - previous));
  if (remaining > 0) await wait(remaining);
  storage.setItem(key, String(now()));
}

function queueInDocument<T>(key: string, task: () => Promise<T>) {
  const previous = documentQueues.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(task);
  documentQueues.set(key, next);
  void next.finally(() => {
    if (documentQueues.get(key) === next) documentQueues.delete(key);
  });
  return next;
}

export function withBrowserRequestThrottle<T>(
  url: string,
  task: () => Promise<T>,
  options: { intervalMs?: number; storage?: Storage } = {},
) {
  const key = requestScopeKey(url);
  const run = async () => {
    await reserveBrowserRequestSlot(url, options);
    return task();
  };
  const locks = globalThis.navigator?.locks;
  if (locks) {
    return locks.request(`nbb-stats-generator:${key}`, run);
  }
  return queueInDocument(key, run);
}
