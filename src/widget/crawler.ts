const crawlerPattern = /bot|crawler|spider|slurp|bingpreview|facebookexternalhit|headless|lighthouse|pagespeed|prerender|wget|curl|python-requests|go-http-client/i;

export function isLikelyBrowserCrawler(
  userAgent = globalThis.navigator?.userAgent ?? "",
  webdriver = globalThis.navigator?.webdriver ?? false,
) {
  return webdriver || crawlerPattern.test(userAgent);
}
