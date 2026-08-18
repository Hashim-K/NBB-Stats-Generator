import { registerNbbStatsWidget } from "./element";

export { readResponseCache, responseCacheKey, writeResponseCache } from "./cache";
export { isLikelyBrowserCrawler } from "./crawler";
export { NbbGamesElement, NbbStandingsElement, registerNbbStatsWidget } from "./element";
export { requestTimestampKey, reserveBrowserRequestSlot, withBrowserRequestThrottle } from "./throttle";
export type * from "./types";

registerNbbStatsWidget();
