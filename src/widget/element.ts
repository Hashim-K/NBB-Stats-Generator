import { isLikelyBrowserCrawler } from "./crawler";
import { readResponseCache, writeResponseCache } from "./cache";
import {
  normalizeBasketballstatsResponse,
  visibleGames,
  withCalculatedRecords,
} from "./direct-normalize";
import { widgetRequestUrl } from "../generator/snippet";
import { widgetStyles } from "./styles";
import { withBrowserRequestThrottle } from "./throttle";
import type {
  GamesResponse,
  GamesWidgetConfig,
  StandingsResponse,
  StandingsWidgetConfig,
  WidgetConfig,
  WidgetGame,
  WidgetLocale,
  WidgetResponse,
  WidgetStanding,
} from "./types";

const requests = new Map<string, Promise<WidgetResponse>>();
const HTMLElementBase = (globalThis.HTMLElement ?? class {}) as typeof HTMLElement;

const messages = {
  en: {
    cached: "Showing stored data while checking for an update",
    crawler: "Live loading is disabled for automated browsers.",
    error: "Basketball data is temporarily unavailable.",
    final: "Final",
    loading: "Loading cached basketball data…",
    noData: "No data found.",
    points: "Pts",
    versus: "VS",
  },
  nl: {
    cached: "Opgeslagen gegevens worden getoond; update wordt gecontroleerd",
    crawler: "Live laden is uitgeschakeld voor geautomatiseerde browsers.",
    error: "De basketbalgegevens zijn tijdelijk niet beschikbaar.",
    final: "Eindstand",
    loading: "Gecachte basketbalgegevens laden…",
    noData: "Geen gegevens gevonden.",
    points: "Pnt",
    versus: "VS",
  },
} as const;

function node<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: { className?: string; text?: string } = {},
) {
  const result = document.createElement(tag);
  if (options.className) result.className = options.className;
  if (options.text !== undefined) result.textContent = options.text;
  return result;
}

function positiveAttribute(host: Element, name: string, required = false) {
  const raw = host.getAttribute(name);
  if (!raw && !required) return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw new TypeError(`${name} must be a positive integer`);
  return value;
}

function enumAttribute<T extends string>(host: Element, name: string, values: readonly T[], fallback: T) {
  const value = host.getAttribute(name);
  return value && (values as readonly string[]).includes(value) ? value as T : fallback;
}

function commonConfig(host: Element) {
  const apiUrl = host.getAttribute("api-url") || undefined;
  const season = host.getAttribute("season");
  if (!season || !/^\d{4}-\d{4}$/.test(season)) throw new TypeError("season must use YYYY-YYYY");
  return {
    ...(apiUrl ? { apiUrl } : {}),
    clubId: positiveAttribute(host, "club-id", true)!,
    season,
    locale: enumAttribute(host, "locale", ["en", "nl"] as const, "nl"),
    theme: enumAttribute(host, "theme", ["auto", "dark", "light"] as const, "auto"),
    accent: host.getAttribute("accent") || "#ef4b23",
  };
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(-2).map((part) => part[0]).join("").toUpperCase();
}

function mark(name: string) {
  return node("span", { className: "mark", text: initials(name) });
}

function date(value: string, locale: WidgetLocale) {
  return new Intl.DateTimeFormat(locale === "nl" ? "nl-NL" : "en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "Europe/Amsterdam",
    weekday: "short",
  }).format(new Date(value));
}

function time(value: string, locale: WidgetLocale) {
  return new Intl.DateTimeFormat(locale === "nl" ? "nl-NL" : "en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Amsterdam",
  }).format(new Date(value));
}

function gameCard(game: WidgetGame, locale: WidgetLocale) {
  const labels = messages[locale];
  const card = node("article", { className: "game" });
  const meta = node("header", { className: "game__meta" });
  meta.append(node("span", { text: date(game.startAt, locale) }), node("span", { text: game.completed ? labels.final : time(game.startAt, locale) }));
  const matchup = node("div", { className: "matchup" });
  const home = node("div", { className: "team" });
  home.append(mark(game.homeTeam), node("span", { className: "team__name", text: game.homeTeam }));
  const score = node("div", { className: "score" });
  score.append(
    node("strong", { text: game.completed ? `${game.homeScore ?? "–"}–${game.awayScore ?? "–"}` : time(game.startAt, locale) }),
    node("small", { text: game.completed ? labels.final : labels.versus }),
  );
  const away = node("div", { className: "team team--away" });
  away.append(node("span", { className: "team__name", text: game.awayTeam }), mark(game.awayTeam));
  matchup.append(home, score, away);
  card.append(meta, matchup);
  const venue = [game.venue, game.city].filter(Boolean).join(", ");
  if (venue) card.append(node("footer", { className: "game__venue", text: venue }));
  return card;
}

function cell(text: string, className?: string, header = false) {
  return node(header ? "th" : "td", { className, text });
}

function gamesTable(games: WidgetGame[], locale: WidgetLocale) {
  const wrap = node("div", { className: "table-wrap" });
  const table = node("table");
  const head = node("thead");
  const row = node("tr");
  const labels = locale === "nl"
    ? ["Datum", "Tijd", "Thuis", "Uit", "Uitslag", "Locatie"]
    : ["Date", "Time", "Home", "Away", "Result", "Venue"];
  labels.forEach((label) => row.append(cell(label, undefined, true)));
  head.append(row);
  const body = node("tbody");
  for (const game of games) {
    const item = node("tr");
    item.append(
      cell(date(game.startAt, locale)),
      cell(time(game.startAt, locale)),
      cell(game.homeTeam),
      cell(game.awayTeam),
      cell(game.completed ? `${game.homeScore ?? "–"}–${game.awayScore ?? "–"}` : "–", "number"),
      cell([game.venue, game.city].filter(Boolean).join(", ") || "–"),
    );
    body.append(item);
  }
  table.append(head, body);
  wrap.append(table);
  return wrap;
}

function standingsTable(
  entries: WidgetStanding[],
  locale: WidgetLocale,
  highlightClubId: number | undefined,
  records: boolean,
) {
  const wrap = node("div", { className: "table-wrap" });
  const table = node("table");
  const head = node("thead");
  const row = node("tr");
  const labels = locale === "nl"
    ? ["#", "Team", "G", ...(records ? ["W", "V", "G"] : []), "Pnt", "+", "−", "+/−"]
    : ["#", "Team", "GP", ...(records ? ["W", "L", "D"] : []), "Pts", "+", "−", "+/−"];
  labels.forEach((label, index) => row.append(cell(label, index === 1 ? undefined : "number", true)));
  head.append(row);
  const body = node("tbody");
  for (const entry of entries) {
    const item = node("tr", { className: entry.clubId === highlightClubId ? "highlight" : undefined });
    const team = cell("");
    const teamLabel = node("span", { className: "standing-team" });
    teamLabel.append(mark(entry.team), node("span", { text: entry.team }));
    team.append(teamLabel);
    const values = [
      cell(String(entry.position), "number"),
      team,
      cell(String(entry.played), "number"),
    ];
    if (records) {
      values.push(
        cell(entry.wins === undefined ? "–" : String(entry.wins), "number"),
        cell(entry.losses === undefined ? "–" : String(entry.losses), "number"),
        cell(entry.draws === undefined ? "–" : String(entry.draws), "number"),
      );
    }
    values.push(
      cell(String(entry.points), "number"),
      cell(String(entry.pointsFor), "number"),
      cell(String(entry.pointsAgainst), "number"),
      cell(entry.difference > 0 ? `+${entry.difference}` : String(entry.difference), "number"),
    );
    item.append(...values);
    body.append(item);
  }
  table.append(head, body);
  wrap.append(table);
  return wrap;
}

function standingsBars(entries: WidgetStanding[], highlightClubId?: number) {
  const bars = node("div", { className: "bars" });
  const max = Math.max(1, ...entries.map((entry) => Math.max(0, entry.points)));
  for (const entry of entries) {
    const bar = node("div", { className: `bar${entry.clubId === highlightClubId ? " highlight" : ""}` });
    const label = node("div", { className: "bar__label" });
    label.append(node("span", { text: `${entry.position}. ${entry.abbreviation ?? entry.team}` }), node("strong", { text: String(entry.points) }));
    const track = node("span", { className: "bar__track" });
    const value = node("span", { className: "bar__value" });
    value.style.width = `${Math.max(2, Math.max(0, entry.points) / max * 100)}%`;
    track.append(value);
    bar.append(label, track);
    bars.append(bar);
  }
  return bars;
}

async function fetchResponse(url: string, config: WidgetConfig) {
  return withBrowserRequestThrottle(url, async (): Promise<WidgetResponse> => {
    const response = await fetch(url, {
      cache: "default",
      credentials: "omit",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(`${config.apiUrl ? "NBB-Stats gateway" : "Basketballstats"} returned HTTP ${response.status}`);
    }
    const payload: unknown = await response.json();
    if (config.apiUrl) return payload as WidgetResponse;
    return normalizeBasketballstatsResponse(payload, config);
  });
}

async function request(url: string, config: WidgetConfig): Promise<WidgetResponse> {
  const active = requests.get(url);
  if (active) return active;
  const pending: Promise<WidgetResponse> = (async () => {
    const normalized = await fetchResponse(url, config);
    // Fetching competition games happens after the standings lock is released;
    // Web Locks are not re-entrant and both endpoints intentionally share it.
    if (config.apiUrl || config.kind !== "standings" || !config.records) return normalized;

    const gamesConfig: GamesWidgetConfig = {
      accent: config.accent,
      clubId: config.clubId,
      competitionId: config.competitionId,
      kind: "games",
      layout: "cards",
      limit: 50,
      locale: config.locale,
      season: config.season,
      theme: config.theme,
      venue: "all",
      view: "all",
    };
    const gamesUrl = widgetRequestUrl(gamesConfig, document.baseURI).toString();
    const cachedGames = readResponseCache(gamesUrl);
    const gamesPayload: WidgetResponse = cachedGames?.fresh
      ? cachedGames.payload
      : await request(gamesUrl, gamesConfig);
    if (!cachedGames?.fresh) writeResponseCache(gamesUrl, gamesPayload);
    if (gamesPayload.meta.resource !== "games" || normalized.meta.resource !== "standings") {
      return normalized;
    }
    return withCalculatedRecords(normalized as StandingsResponse, (gamesPayload as GamesResponse).data);
  })().finally(() => requests.delete(url));
  requests.set(url, pending);
  return pending;
}

abstract class NbbElement extends HTMLElementBase {
  protected readonly content: HTMLElement;
  protected readonly status: HTMLElement;
  private generation = 0;

  constructor() {
    super();
    const root = this.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = widgetStyles;
    this.status = node("p", { className: "status" });
    this.status.setAttribute("aria-live", "polite");
    this.content = node("div");
    const shell = node("div", { className: "root theme-auto" });
    shell.append(this.status, this.content);
    root.append(style, shell);
  }

  connectedCallback() { void this.load(); }
  attributeChangedCallback() { if (this.isConnected) void this.load(); }
  protected abstract config(): WidgetConfig;
  protected abstract renderPayload(payload: WidgetResponse, config: WidgetConfig): void;

  private async load() {
    const generation = ++this.generation;
    try {
      const config = this.config();
      const shell = this.shadowRoot!.querySelector<HTMLElement>(".root")!;
      shell.className = `root theme-${config.theme}`;
      if (globalThis.CSS?.supports?.("color", config.accent)) this.style.setProperty("--nbb-accent", config.accent);
      const url = widgetRequestUrl(config, document.baseURI).toString();
      const cached = readResponseCache(url);
      if (cached) {
        this.renderPayload(cached.payload, config);
        if (cached.fresh) { this.status.textContent = ""; return; }
        this.status.textContent = messages[config.locale].cached;
      } else {
        this.status.textContent = messages[config.locale].loading;
      }
      if (isLikelyBrowserCrawler()) {
        if (!cached) this.content.replaceChildren(node("div", { className: "notice", text: messages[config.locale].crawler }));
        return;
      }
      const payload = await request(url, config);
      if (generation !== this.generation) return;
      writeResponseCache(url, payload);
      this.status.textContent = "";
      this.renderPayload(payload, config);
    } catch (error) {
      if (generation !== this.generation) return;
      this.status.textContent = "";
      const locale = enumAttribute(this, "locale", ["en", "nl"] as const, "nl");
      this.content.replaceChildren(node("div", { className: "notice", text: messages[locale].error }));
      this.dispatchEvent(new CustomEvent("nbb-error", { detail: error }));
    }
  }
}

export class NbbGamesElement extends NbbElement {
  static observedAttributes = ["api-url", "club-id", "season", "team-id", "competition-id", "layout", "limit", "locale", "theme", "accent", "venue", "view"];
  protected config(): GamesWidgetConfig {
    return {
      kind: "games",
      ...commonConfig(this),
      teamId: positiveAttribute(this, "team-id"),
      competitionId: positiveAttribute(this, "competition-id"),
      layout: enumAttribute(this, "layout", ["cards", "table"] as const, "cards"),
      limit: positiveAttribute(this, "limit") ?? 7,
      venue: enumAttribute(this, "venue", ["all", "away", "home"] as const, "all"),
      view: enumAttribute(this, "view", ["all", "results", "upcoming"] as const, "upcoming"),
    };
  }
  protected renderPayload(payload: WidgetResponse, config: WidgetConfig) {
    if (payload.meta.resource !== "games" || config.kind !== "games") throw new TypeError("Unexpected games response");
    const games = visibleGames((payload as GamesResponse).data, config);
    if (!games.length) {
      this.content.replaceChildren(node("div", { className: "notice", text: messages[config.locale].noData }));
      return;
    }
    if (config.layout === "table") this.content.replaceChildren(gamesTable(games, config.locale));
    else {
      const list = node("div", { className: "games" });
      list.append(...games.map((game) => gameCard(game, config.locale)));
      this.content.replaceChildren(list);
    }
  }
}

export class NbbStandingsElement extends NbbElement {
  static observedAttributes = ["api-url", "club-id", "season", "competition-id", "highlight-club-id", "layout", "records", "locale", "theme", "accent"];
  protected config(): StandingsWidgetConfig {
    return {
      kind: "standings",
      ...commonConfig(this),
      competitionId: positiveAttribute(this, "competition-id", true)!,
      highlightClubId: positiveAttribute(this, "highlight-club-id"),
      layout: enumAttribute(this, "layout", ["bars", "combined", "table"] as const, "table"),
      records: this.hasAttribute("records"),
    };
  }
  protected renderPayload(payload: WidgetResponse, config: WidgetConfig) {
    if (payload.meta.resource !== "standings" || config.kind !== "standings") throw new TypeError("Unexpected standings response");
    const entries = (payload as StandingsResponse).data.entries;
    if (!entries.length) {
      this.content.replaceChildren(node("div", { className: "notice", text: messages[config.locale].noData }));
      return;
    }
    const table = standingsTable(entries, config.locale, config.highlightClubId, config.records);
    const bars = standingsBars(entries, config.highlightClubId);
    if (config.layout === "table") this.content.replaceChildren(table);
    else if (config.layout === "bars") this.content.replaceChildren(bars);
    else {
      const combined = node("div", { className: "combined" });
      combined.append(table, bars);
      this.content.replaceChildren(combined);
    }
  }
}

export function registerNbbStatsWidget() {
  if (!globalThis.customElements) return;
  if (!customElements.get("nbb-games")) customElements.define("nbb-games", NbbGamesElement);
  if (!customElements.get("nbb-standings")) customElements.define("nbb-standings", NbbStandingsElement);
}
