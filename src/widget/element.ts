import { isLikelyBrowserCrawler } from "./crawler";
import { readResponseCache, writeResponseCache } from "./cache";
import {
  normalizeBasketballstatsResponse,
  visibleGames,
  withCalculatedRecords,
} from "./direct-normalize";
import { widgetRequestUrl } from "../generator/snippet";
import {
  defaultGameColumns,
  defaultStandingsColumns,
  gameColumnDefinitions,
  gameColumnKeys,
  standingsColumnDefinitions,
  standingsColumnKeys,
  type GameColumnKey,
  type StandingsColumnKey,
} from "./columns";
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

function booleanAttribute(host: Element, name: string, fallback: boolean) {
  const value = host.getAttribute(name);
  if (value === null) return fallback;
  return !["0", "false", "no", "off"].includes(value.toLowerCase());
}

function listAttribute<T extends string>(
  host: Element,
  name: string,
  allowed: readonly T[],
  fallback: readonly T[],
) {
  const raw = host.getAttribute(name);
  if (raw === null) return [...fallback];
  const selected = raw.split(",").map((entry) => entry.trim())
    .filter((entry): entry is T => (allowed as readonly string[]).includes(entry));
  return selected.length ? [...new Set(selected)] : [...fallback];
}

function commonConfig(host: Element) {
  const apiUrl = host.getAttribute("api-url") || undefined;
  const season = host.getAttribute("season");
  if (!season || !/^\d{4}-\d{4}$/.test(season)) throw new TypeError("season must use YYYY-YYYY");
  return {
    ...(apiUrl ? { apiUrl } : {}),
    clubId: positiveAttribute(host, "club-id"),
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

function cellValue(value: string | number | undefined) {
  return value === undefined || value === "" ? "–" : String(value);
}

function amsterdamParts(value: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Europe/Amsterdam",
    year: "numeric",
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((entry) => entry.type === type)?.value);
  return { day: part("day"), month: part("month"), year: part("year") };
}

function localizedDate(value: string, locale: WidgetLocale) {
  return new Intl.DateTimeFormat(locale === "nl" ? "nl-NL" : "en-GB", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Europe/Amsterdam",
    year: "numeric",
  }).format(new Date(value));
}

function localizedDateTime(value: string, locale: WidgetLocale) {
  return new Intl.DateTimeFormat(locale === "nl" ? "nl-NL" : "en-GB", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Amsterdam",
  }).format(new Date(value));
}

function weekday(value: string, locale: WidgetLocale) {
  return new Intl.DateTimeFormat(locale === "nl" ? "nl-NL" : "en-GB", {
    timeZone: "Europe/Amsterdam",
    weekday: "long",
  }).format(new Date(value));
}

function month(value: string, locale: WidgetLocale) {
  return new Intl.DateTimeFormat(locale === "nl" ? "nl-NL" : "en-GB", {
    month: "long",
    timeZone: "Europe/Amsterdam",
  }).format(new Date(value));
}

function quarter(game: WidgetGame, label: string, side: "away" | "home") {
  return (game.quarterScores ?? []).find((score) => score.label === label)?.[side];
}

function gameValue(game: WidgetGame, key: GameColumnKey, locale: WidgetLocale): string | number | undefined {
  const parts = amsterdamParts(game.startAt);
  const dayNumber = (new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay() + 6) % 7 + 1;
  switch (key) {
    case "nr": return game.gameNumber;
    case "datum_f": return localizedDate(game.startAt, locale);
    case "dag_nr": return dayNumber;
    case "dag": return weekday(game.startAt, locale);
    case "maand_nr": return parts.month;
    case "maand": return month(game.startAt, locale);
    case "tijd": return time(game.startAt, locale);
    case "datum_tijd": return localizedDateTime(game.startAt, locale);
    case "wed_letter": return game.gameLetter;
    case "cmp_id": return game.competitionId;
    case "cmp_nr": return game.competitionNumber;
    case "cmp_naam": return game.competitionName;
    case "thuis_ploeg_id": return game.homeTeamId;
    case "thuis_ploeg": return game.homeTeam;
    case "logo_thuis": return game.homeLogo;
    case "uit_ploeg_id": return game.awayTeamId;
    case "uit_ploeg": return game.awayTeam;
    case "logo_uit": return game.awayLogo;
    case "loc_id": return game.locationId;
    case "loc_naam": return game.venue;
    case "veld": return game.court;
    case "loc_plaats": return game.city;
    case "lat": return game.latitude;
    case "lon": return game.longitude;
    case "uitslag": return game.completed ? `${game.homeScore ?? ""}-${game.awayScore ?? ""}` : undefined;
    case "score_thuis": return game.homeScore;
    case "score_uit": return game.awayScore;
    case "score_thuis_1e_kwart": return quarter(game, "Q1", "home");
    case "score_uit_1e_kwart": return quarter(game, "Q1", "away");
    case "score_thuis_rust": return quarter(game, "HT", "home");
    case "score_uit_rust": return quarter(game, "HT", "away");
    case "score_thuis_3e_kwart": return quarter(game, "Q3", "home");
    case "score_uit_3e_kwart": return quarter(game, "Q3", "away");
    case "datum": return game.startAt;
    case "id": return game.id;
  }
}

function standingValue(entry: WidgetStanding, key: StandingsColumnKey): string | number | undefined {
  switch (key) {
    case "positie": return entry.position;
    case "rang": return entry.rank;
    case "team": return entry.team;
    case "afko": return entry.abbreviation;
    case "clb_id": return entry.clubId;
    case "status": return entry.status;
    case "logo": return entry.logo;
    case "gespeeld": return entry.played;
    case "gewonnen": return entry.wins;
    case "verloren": return entry.losses;
    case "gelijk": return entry.draws;
    case "punten": return entry.points;
    case "percentage": return entry.percentage === undefined ? undefined : `${entry.percentage}%`;
    case "eigenscore": return entry.pointsFor;
    case "tegenscore": return entry.pointsAgainst;
    case "saldo": return entry.difference > 0 ? `+${entry.difference}` : entry.difference;
    case "datum": return entry.lastGameAt;
    case "ID": return entry.teamId;
  }
}

function compareValues(left: string | number | undefined, right: string | number | undefined) {
  if (left === undefined) return right === undefined ? 0 : 1;
  if (right === undefined) return -1;
  if (typeof left === "number" && typeof right === "number") return left - right;
  return String(left).localeCompare(String(right), "nl", { numeric: true });
}

function logoCell(url: string | undefined) {
  const cell = node("td");
  if (!url) { cell.textContent = "–"; return cell; }
  const logo = node("img", { className: "table-logo" });
  logo.src = url;
  logo.alt = "";
  logo.loading = "lazy";
  logo.referrerPolicy = "no-referrer";
  cell.append(logo);
  return cell;
}

function isoWeek(game: WidgetGame, locale: WidgetLocale) {
  const parts = amsterdamParts(game.startAt);
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  const day = (date.getUTCDay() + 6) % 7;
  const monday = new Date(date);
  monday.setUTCDate(date.getUTCDate() - day);
  const thursday = new Date(monday);
  thursday.setUTCDate(monday.getUTCDate() + 3);
  const first = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));
  const firstDay = (first.getUTCDay() + 6) % 7;
  const firstMonday = new Date(first);
  firstMonday.setUTCDate(first.getUTCDate() - firstDay);
  const week = 1 + Math.round((monday.getTime() - firstMonday.getTime()) / 604_800_000);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const format = new Intl.DateTimeFormat(locale === "nl" ? "nl-NL" : "en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  const label = locale === "nl"
    ? `Week ${week} (${format.format(monday)} – ${format.format(sunday)} ${sunday.getUTCFullYear()})`
    : `Week ${week} (${format.format(monday)} – ${format.format(sunday)} ${sunday.getUTCFullYear()})`;
  return { key: `${thursday.getUTCFullYear()}-${String(week).padStart(2, "0")}`, label };
}

function gamesTable(games: WidgetGame[], config: GamesWidgetConfig) {
  const wrap = node("div", { className: "table-wrap" });
  let sort: { direction: 1 | -1; key: GameColumnKey } | undefined;
  const labels = new Map(gameColumnDefinitions.map((definition) => [definition.key, definition.label[config.locale]]));

  const render = () => {
    const table = node("table");
    table.className = config.tableClass;
    const head = node("thead");
    const header = node("tr");
    for (const key of config.columns) {
      const th = node("th");
      const label = labels.get(key) ?? key;
      th.textContent = `${label}${sort?.key === key ? (sort.direction === 1 ? " ▲" : " ▼") : ""}`;
      if (config.enableSorting) {
        th.tabIndex = 0;
        th.setAttribute("role", "button");
        th.setAttribute("aria-sort", sort?.key === key ? (sort.direction === 1 ? "ascending" : "descending") : "none");
        const activate = () => {
          sort = sort?.key === key ? { key, direction: sort.direction === 1 ? -1 : 1 } : { key, direction: 1 };
          render();
        };
        th.addEventListener("click", activate);
        th.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") activate(); });
      }
      header.append(th);
    }
    head.append(header);
    const body = node("tbody");
    const sorted = sort
      ? [...games].sort((left, right) => sort!.direction * compareValues(
          gameValue(left, sort!.key, config.locale),
          gameValue(right, sort!.key, config.locale),
        ))
      : games;
    const grouped = new Map<string, WidgetGame[]>();
    if (config.groupByWeek) {
      for (const game of sorted) {
        const key = isoWeek(game, config.locale).key;
        const group = grouped.get(key) ?? [];
        group.push(game);
        grouped.set(key, group);
      }
    }
    const groups: Array<[string, WidgetGame[]]> = config.groupByWeek
      ? [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right))
      : [["", sorted]];
    let rowIndex = 0;
    for (const [, group] of groups) {
      if (config.groupByWeek && group.length) {
        const groupRow = node("tr", { className: "week-group" });
        const groupCell = node("td", { text: isoWeek(group[0]!, config.locale).label });
        groupCell.colSpan = Math.max(1, config.columns.length);
        groupRow.append(groupCell);
        body.append(groupRow);
      }
      for (const game of group) {
        const row = node("tr");
        row.style.backgroundColor = rowIndex % 2 === 0 ? config.evenRowColor : config.oddRowColor;
        rowIndex += 1;
        for (const key of config.columns) {
          if (key === "logo_thuis" || key === "logo_uit") {
            row.append(logoCell(gameValue(game, key, config.locale) as string | undefined));
          } else {
            row.append(node("td", { text: cellValue(gameValue(game, key, config.locale)) }));
          }
        }
        body.append(row);
      }
    }
    table.append(head, body);
    wrap.replaceChildren(table);
  };
  render();
  return wrap;
}

function standingsTable(response: StandingsResponse, config: StandingsWidgetConfig) {
  const container = node("div", { className: "standings-table" });
  const wrap = node("div", { className: "table-wrap" });
  let sort: { direction: 1 | -1; key: StandingsColumnKey } | undefined;
  const labels = new Map(standingsColumnDefinitions.map((definition) => [definition.key, definition.label[config.locale]]));
  if (config.showMeta) {
    const parts = [
      response.data.name,
      response.data.season,
      config.locale === "nl" ? `${response.data.entries.length} teams` : `${response.data.entries.length} teams`,
    ].filter(Boolean);
    container.append(node("p", { className: "standings-meta", text: parts.join(" · ") }));
  }
  const render = () => {
    const table = node("table");
    table.className = config.tableClass;
    const head = node("thead");
    const header = node("tr");
    for (const key of config.columns) {
      const th = node("th");
      th.textContent = `${labels.get(key) ?? key}${sort?.key === key ? (sort.direction === 1 ? " ▲" : " ▼") : ""}`;
      if (config.enableSorting) {
        th.tabIndex = 0;
        th.setAttribute("role", "button");
        th.setAttribute("aria-sort", sort?.key === key ? (sort.direction === 1 ? "ascending" : "descending") : "none");
        const activate = () => {
          sort = sort?.key === key ? { key, direction: sort.direction === 1 ? -1 : 1 } : { key, direction: 1 };
          render();
        };
        th.addEventListener("click", activate);
        th.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") activate(); });
      }
      header.append(th);
    }
    head.append(header);
    const body = node("tbody");
    const entries = sort
      ? [...response.data.entries].sort((left, right) => sort!.direction * compareValues(
          standingValue(left, sort!.key), standingValue(right, sort!.key),
        ))
      : response.data.entries;
    entries.forEach((entry, index) => {
      const row = node("tr", { className: entry.clubId === config.highlightClubId ? "highlight" : undefined });
      row.style.backgroundColor = entry.clubId === config.highlightClubId
        ? config.highlightColor
        : index % 2 === 0 ? config.evenRowColor : config.oddRowColor;
      for (const key of config.columns) {
        if (key === "logo") row.append(logoCell(entry.logo));
        else row.append(node("td", { text: cellValue(standingValue(entry, key)) }));
      }
      body.append(row);
    });
    table.append(head, body);
    wrap.replaceChildren(table);
  };
  render();
  container.append(wrap);
  return container;
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
      columns: defaultGameColumns,
      competitionId: config.competitionId,
      enableSorting: true,
      evenRowColor: "#ffffff",
      groupByWeek: false,
      kind: "games",
      layout: "cards",
      locale: config.locale,
      oddRowColor: "#f2f4f7",
      season: config.season,
      tableClass: "wedstrijd-table",
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
  static observedAttributes = [
    "api-url", "club-id", "season", "team-id", "competition-id", "location-id",
    "layout", "limit", "locale", "theme", "accent", "venue", "view", "columns",
    "enable-sorting", "even-row-color", "odd-row-color", "group-by-week", "table-class",
  ];
  protected config(): GamesWidgetConfig {
    const config: GamesWidgetConfig = {
      kind: "games",
      ...commonConfig(this),
      teamId: positiveAttribute(this, "team-id"),
      competitionId: positiveAttribute(this, "competition-id"),
      locationId: positiveAttribute(this, "location-id"),
      layout: enumAttribute(this, "layout", ["cards", "table"] as const, "table"),
      limit: positiveAttribute(this, "limit"),
      venue: enumAttribute(this, "venue", ["all", "away", "home"] as const, "all"),
      view: enumAttribute(this, "view", ["all", "results", "upcoming"] as const, "all"),
      columns: listAttribute(this, "columns", gameColumnKeys, defaultGameColumns),
      enableSorting: booleanAttribute(this, "enable-sorting", true),
      evenRowColor: this.getAttribute("even-row-color") || "#ffffff",
      oddRowColor: this.getAttribute("odd-row-color") || "#f2f4f7",
      groupByWeek: booleanAttribute(this, "group-by-week", false),
      tableClass: this.getAttribute("table-class") || "wedstrijd-table",
    };
    if (!config.clubId && !config.teamId && !config.competitionId && !config.locationId) {
      throw new TypeError("games require a club, team, competition, or location");
    }
    if (!config.clubId && config.venue !== "all") throw new TypeError("home/away filtering requires a club");
    return config;
  }
  protected renderPayload(payload: WidgetResponse, config: WidgetConfig) {
    if (payload.meta.resource !== "games" || config.kind !== "games") throw new TypeError("Unexpected games response");
    const games = visibleGames((payload as GamesResponse).data, config);
    if (!games.length) {
      this.content.replaceChildren(node("div", { className: "notice", text: messages[config.locale].noData }));
      return;
    }
    if (config.layout === "table") this.content.replaceChildren(gamesTable(games, config));
    else {
      const list = node("div", { className: "games" });
      list.append(...games.map((game) => gameCard(game, config.locale)));
      this.content.replaceChildren(list);
    }
  }
}

export class NbbStandingsElement extends NbbElement {
  static observedAttributes = [
    "api-url", "club-id", "season", "competition-id", "highlight-club-id", "layout",
    "records", "locale", "theme", "accent", "columns", "enable-sorting",
    "even-row-color", "odd-row-color", "highlight-color", "show-meta", "table-class",
  ];
  protected config(): StandingsWidgetConfig {
    return {
      kind: "standings",
      ...commonConfig(this),
      competitionId: positiveAttribute(this, "competition-id", true)!,
      highlightClubId: positiveAttribute(this, "highlight-club-id"),
      layout: enumAttribute(this, "layout", ["bars", "combined", "table"] as const, "table"),
      records: this.hasAttribute("records"),
      columns: listAttribute(this, "columns", standingsColumnKeys, defaultStandingsColumns),
      enableSorting: booleanAttribute(this, "enable-sorting", true),
      evenRowColor: this.getAttribute("even-row-color") || "#ffffff",
      oddRowColor: this.getAttribute("odd-row-color") || "#f2f4f7",
      highlightColor: this.getAttribute("highlight-color") || "#fff3cd",
      showMeta: booleanAttribute(this, "show-meta", false),
      tableClass: this.getAttribute("table-class") || "stand-table",
    };
  }
  protected renderPayload(payload: WidgetResponse, config: WidgetConfig) {
    if (payload.meta.resource !== "standings" || config.kind !== "standings") throw new TypeError("Unexpected standings response");
    const entries = (payload as StandingsResponse).data.entries;
    if (!entries.length) {
      this.content.replaceChildren(node("div", { className: "notice", text: messages[config.locale].noData }));
      return;
    }
    const table = standingsTable(payload as StandingsResponse, config);
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
