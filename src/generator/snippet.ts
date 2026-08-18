import type { WidgetConfig } from "../widget/types";

export const BASKETBALLSTATS_GAMES_URL =
  "https://api.basketballstats.nl/db/json/wedstrijd.pl";
export const BASKETBALLSTATS_STANDINGS_URL =
  "https://www.basketballstats.nl/db/json/stand.pl";
export const NBB_STATS_WIDGET_SCRIPT_URL =
  "https://nbb-gen.hashimkarim.com/nbb-stats-widget.js";

function positive(value: number | undefined, label: string) {
  if (value === undefined || !Number.isInteger(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive integer`);
  }
  return String(value);
}

function escapeAttribute(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function optional(name: string, value: string | number | undefined) {
  return value === undefined || value === ""
    ? undefined
    : `${name}="${escapeAttribute(String(value))}"`;
}

export function assertSafeGatewayUrl(value: string, base = globalThis.location?.href ?? "http://localhost") {
  const url = new URL(value, base);
  const local = ["localhost", "127.0.0.1"].includes(url.hostname);
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
    throw new TypeError("The widget gateway must use HTTPS");
  }
  return url;
}

export function widgetRequestUrl(config: WidgetConfig, base?: string) {
  if (!config.apiUrl) return basketballstatsRequestUrl(config, base);

  const url = assertSafeGatewayUrl(config.apiUrl, base);
  url.searchParams.set("resource", config.kind);
  url.searchParams.set("clubId", positive(config.clubId, "clubId"));
  url.searchParams.set("season", config.season);
  if (config.kind === "games") {
    if (config.teamId) url.searchParams.set("teamId", positive(config.teamId, "teamId"));
    if (config.competitionId) {
      url.searchParams.set("competitionId", positive(config.competitionId, "competitionId"));
    }
    url.searchParams.set("limit", positive(config.limit, "limit"));
    url.searchParams.set("venue", config.venue);
    url.searchParams.set("view", config.view);
  } else {
    url.searchParams.set("competitionId", positive(config.competitionId, "competitionId"));
    if (config.records) url.searchParams.set("records", "1");
  }
  url.searchParams.sort();
  return url;
}

/**
 * Build the source URL used by a generated embed. Presentation-only options
 * are intentionally excluded so layouts and limits share one local response.
 */
export function basketballstatsRequestUrl(config: WidgetConfig, base?: string) {
  const url = new URL(
    config.kind === "games"
      ? BASKETBALLSTATS_GAMES_URL
      : BASKETBALLSTATS_STANDINGS_URL,
  );
  const pageOrigin = (() => {
    try {
      return new URL(base ?? globalThis.location?.href ?? "https://example.invalid").origin;
    } catch {
      return "https://example.invalid";
    }
  })();
  url.searchParams.set("origin", pageOrigin);
  url.searchParams.set("seizoen", config.season);
  if (config.kind === "games") {
    if (config.teamId) {
      url.searchParams.set("plg_ID", positive(config.teamId, "teamId"));
    } else if (config.competitionId) {
      url.searchParams.set("cmp_ID", positive(config.competitionId, "competitionId"));
    } else {
      url.searchParams.set("clb_ID", positive(config.clubId, "clubId"));
    }
  } else {
    url.searchParams.set("cmp_ID", positive(config.competitionId, "competitionId"));
    // Fragments are not sent over HTTP. This only separates the local cache
    // entry that also contains records calculated from competition games.
    if (config.records) url.hash = "records";
  }
  url.searchParams.sort();
  return url;
}

export function generateSnippet(
  config: WidgetConfig,
  scriptUrl = NBB_STATS_WIDGET_SCRIPT_URL,
) {
  const attributes: Array<string | undefined> = [
    `club-id="${positive(config.clubId, "clubId")}"`,
    `season="${escapeAttribute(config.season)}"`,
    optional("locale", config.locale),
    optional("theme", config.theme),
    optional("accent", config.accent),
  ];
  if (config.kind === "games") {
    attributes.push(
      optional("team-id", config.teamId),
      optional("competition-id", config.competitionId),
      optional("layout", config.layout),
      optional("limit", config.limit),
      optional("venue", config.venue),
      optional("view", config.view),
    );
  } else {
    attributes.push(
      `competition-id="${positive(config.competitionId, "competitionId")}"`,
      optional("highlight-club-id", config.highlightClubId),
      optional("layout", config.layout),
      config.records ? "records" : undefined,
    );
  }
  const tag = config.kind === "games" ? "nbb-games" : "nbb-standings";
  return [
    `<script defer src="${escapeAttribute(scriptUrl)}"></script>`,
    `<${tag}\n  ${attributes.filter(Boolean).join("\n  ")}\n></${tag}>`,
  ].join("\n");
}
