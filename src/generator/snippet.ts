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

function optional(name: string, value: boolean | string | number | undefined) {
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
  if (config.clubId) url.searchParams.set("clubId", positive(config.clubId, "clubId"));
  url.searchParams.set("season", config.season);
  if (config.kind === "games") {
    if (config.teamId) url.searchParams.set("teamId", positive(config.teamId, "teamId"));
    if (config.competitionId) {
      url.searchParams.set("competitionId", positive(config.competitionId, "competitionId"));
    }
    if (config.locationId) url.searchParams.set("locationId", positive(config.locationId, "locationId"));
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
  if (config.kind === "games") {
    url.searchParams.set("seizoen", config.season);
    if (!config.clubId && !config.teamId && !config.competitionId && !config.locationId) {
      throw new TypeError("games require a club, team, competition, or location");
    }
    if (config.clubId) url.searchParams.set("clb_ID", positive(config.clubId, "clubId"));
    if (config.teamId) url.searchParams.set("plg_ID", positive(config.teamId, "teamId"));
    if (config.competitionId) url.searchParams.set("cmp_ID", positive(config.competitionId, "competitionId"));
    if (config.locationId) url.searchParams.set("loc_ID", positive(config.locationId, "locationId"));
  } else {
    url.searchParams.set("szn_Naam", config.season);
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
  if (config.kind === "games"
    && !config.clubId
    && !config.teamId
    && !config.competitionId
    && !config.locationId) {
    throw new TypeError("games require a club, team, competition, or location");
  }
  const attributes: Array<string | undefined> = [
    optional("club-id", config.clubId),
    `season="${escapeAttribute(config.season)}"`,
    optional("locale", config.locale),
    optional("theme", config.theme),
    optional("accent", config.accent),
  ];
  if (config.kind === "games") {
    attributes.push(
      optional("team-id", config.teamId),
      optional("competition-id", config.competitionId),
      optional("location-id", config.locationId),
      optional("layout", config.layout),
      optional("limit", config.limit),
      optional("venue", config.venue),
      optional("view", config.view),
      optional("columns", config.columns.join(",")),
      optional("enable-sorting", config.enableSorting),
      optional("even-row-color", config.evenRowColor),
      optional("odd-row-color", config.oddRowColor),
      optional("group-by-week", config.groupByWeek),
      optional("table-class", config.tableClass),
    );
  } else {
    attributes.push(
      `competition-id="${positive(config.competitionId, "competitionId")}"`,
      optional("highlight-club-id", config.highlightClubId),
      optional("layout", config.layout),
      optional("columns", config.columns.join(",")),
      optional("enable-sorting", config.enableSorting),
      optional("even-row-color", config.evenRowColor),
      optional("odd-row-color", config.oddRowColor),
      optional("highlight-color", config.highlightColor),
      optional("show-meta", config.showMeta),
      optional("table-class", config.tableClass),
      config.records ? "records" : undefined,
    );
  }
  const tag = config.kind === "games" ? "nbb-games" : "nbb-standings";
  return [
    `<script defer src="${escapeAttribute(scriptUrl)}"></script>`,
    `<${tag}\n  ${attributes.filter(Boolean).join("\n  ")}\n></${tag}>`,
  ].join("\n");
}
