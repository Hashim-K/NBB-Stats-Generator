import {
  isHistoricalSeason,
  NBBStats,
  NbbCacheMissError,
  SqliteCache,
  type NbbGame,
  type NbbStandingEntry,
  type NbbStandings,
  type JsonObject,
  type RefreshMode,
} from "nbb-stats";

import type { WidgetGame, WidgetResponse, WidgetStanding } from "../src/widget/types";
import type {
  NamedOption,
  SelectionOptionsResponse,
} from "../src/options/types";
import { serverConfig } from "./config";

const config = serverConfig();
const cache = new SqliteCache({ filename: config.cacheFile });
const clients = new Map<number, NBBStats>();
const DIRECTORY_CLIENT_ID = 57;

function clientFor(clubId: number) {
  const current = clients.get(clubId);
  if (current) return current;
  const client = new NBBStats({
    cache,
    clubId,
    contact: config.contact,
    minRequestIntervalMs: config.upstreamIntervalMs,
  });
  clients.set(clubId, client);
  return client;
}

function rawValue(raw: JsonObject, keys: string[]) {
  for (const key of keys) {
    const value = raw[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function rawText(raw: JsonObject, keys: string[]) {
  const value = rawValue(raw, keys);
  return value === undefined ? undefined : String(value);
}

function rawNumber(raw: JsonObject, keys: string[], fallback?: number) {
  const parsed = Number(rawValue(raw, keys));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function gameWithoutPrivateFields({ raw, ...game }: NbbGame): WidgetGame {
  return {
    ...game,
    ...(rawText(raw, ["cmp_naam"]) ? { competitionName: rawText(raw, ["cmp_naam"]) } : {}),
    ...(rawText(raw, ["cmp_nr"]) ? { competitionNumber: rawText(raw, ["cmp_nr"]) } : {}),
    ...(rawText(raw, ["wed_letter"]) ? { gameLetter: rawText(raw, ["wed_letter"]) } : {}),
  };
}

function standingWithoutPrivateFields({ raw, ...entry }: NbbStandingEntry): WidgetStanding {
  return {
    ...entry,
    rank: rawNumber(raw, ["rang"], entry.position)!,
    ...(rawText(raw, ["status"]) ? { status: rawText(raw, ["status"]) } : {}),
    ...(rawText(raw, ["datum"]) ? { lastGameAt: rawText(raw, ["datum"]) } : {}),
  };
}

function standingsWithoutPrivateFields({ raw: _raw, competitionNumber: _number, entries, ...standings }: NbbStandings) {
  return { ...standings, entries: entries.map(standingWithoutPrivateFields) };
}

function namedOptions(entries: NamedOption[]) {
  const unique = [...new Map(entries.map((entry) => [entry.id, entry])).values()];
  const nameCounts = new Map<string, number>();
  for (const { name } of unique) {
    const key = name.trim().toLocaleLowerCase("nl");
    nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
  }
  return unique
    .map((entry) => nameCounts.get(entry.name.trim().toLocaleLowerCase("nl"))! > 1
      ? { ...entry, name: `${entry.name} — ID ${entry.id}` }
      : entry)
    .sort((left, right) => left.name.localeCompare(right.name, "nl", { numeric: true }));
}

function uniqueLinks<Link>(entries: Link[], key: (entry: Link) => string) {
  return [...new Map(entries.map((entry) => [key(entry), entry])).values()];
}

function positive(parameters: URLSearchParams, name: string, required = false) {
  const raw = parameters.get(name);
  if (!raw && !required) return undefined;
  if (!raw || !/^\d+$/.test(raw) || Number(raw) <= 0) throw new TypeError(`${name} must be a positive integer`);
  return Number(raw);
}

function season(parameters: URLSearchParams) {
  const value = parameters.get("season");
  if (!value || !/^\d{4}-\d{4}$/.test(value)) throw new TypeError("season must use YYYY-YYYY");
  const [start, end] = value.split("-").map(Number);
  if (end !== start + 1 || start < 1950 || start > new Date().getFullYear() + 1) {
    throw new TypeError("season is outside the supported range");
  }
  return value;
}

function choice<T extends string>(parameters: URLSearchParams, name: string, values: readonly T[], fallback: T) {
  const value = parameters.get(name);
  if (!value) return fallback;
  if (!(values as readonly string[]).includes(value)) throw new TypeError(`${name} has an unsupported value`);
  return value as T;
}

function meta<Resource extends "games" | "standings">(
  client: NBBStats,
  clubId: number | undefined,
  selectedSeason: string,
  resource: Resource,
) {
  return {
    cache: "persistent-nbb-stats" as const,
    clubId,
    generatedAt: new Date().toISOString(),
    refreshAfter: isHistoricalSeason(selectedSeason, client.currentSeason)
      ? null
      : client.nextRefreshAt().toISOString(),
    resource,
    season: selectedSeason,
  };
}

export async function widgetData(parameters: URLSearchParams, refresh: RefreshMode): Promise<WidgetResponse> {
  const clubId = positive(parameters, "clubId");
  const selectedSeason = season(parameters);
  const resource = choice(parameters, "resource", ["games", "standings"] as const, "games");
  const client = clientFor(clubId ?? DIRECTORY_CLIENT_ID);

  if (resource === "games") {
    const teamId = positive(parameters, "teamId");
    const competitionId = positive(parameters, "competitionId");
    const locationId = positive(parameters, "locationId");
    if (!clubId && !teamId && !competitionId && !locationId) {
      throw new TypeError("games require a club, team, competition, or location");
    }
    const view = choice(parameters, "view", ["all", "results", "upcoming"] as const, "all");
    const venue = choice(parameters, "venue", ["all", "away", "home"] as const, "all");
    if (!clubId && venue !== "all") throw new TypeError("home/away filtering requires a club");
    const requestedLimit = positive(parameters, "limit");
    const limit = requestedLimit === undefined ? undefined : Math.min(250, requestedLimit);
    const now = Date.now();
    const games = (await client.games({
      clubId,
      competitionId,
      locationId,
      season: selectedSeason,
      teamId,
      refresh,
    }))
      .filter((game) => clubId === undefined || game.homeClubId === clubId || game.awayClubId === clubId)
      .filter((game) => venue === "all"
        || (venue === "home" ? game.homeClubId === clubId : game.awayClubId === clubId))
      .filter((game) => {
        if (view === "results") return game.completed;
        if (view === "upcoming") return !game.completed && Date.parse(game.startAt) >= now;
        return true;
      })
      .sort((left, right) => {
        const difference = Date.parse(left.startAt) - Date.parse(right.startAt);
        return view === "results" ? -difference : difference;
      })
      .map(gameWithoutPrivateFields);
    const data = limit === undefined ? games : games.slice(0, limit);
    return { data, meta: meta(client, clubId, selectedSeason, "games") };
  }

  const competitionId = positive(parameters, "competitionId", true)!;
  const records = ["1", "true"].includes(parameters.get("records") ?? "");
  const standings = records
    ? await client.standingsWithRecords(competitionId, { season: selectedSeason, refresh })
    : await client.standings(competitionId, { season: selectedSeason, refresh });
  return {
    data: standingsWithoutPrivateFields(standings),
    meta: meta(client, clubId, selectedSeason, "standings"),
  };
}

export async function selectionOptions(
  parameters: URLSearchParams,
  refresh: RefreshMode,
): Promise<SelectionOptionsResponse> {
  const resource = choice(parameters, "resource", ["clubs", "club", "competition"] as const, "clubs");

  if (resource === "clubs") {
    const client = clientFor(DIRECTORY_CLIENT_ID);
    const clubs = await client.clubs({ refresh });
    return {
      data: namedOptions(clubs.map(({ id, name }) => ({ id, name }))),
      meta: {
        cache: "persistent-nbb-stats",
        generatedAt: new Date().toISOString(),
        refreshAfter: client.nextRefreshAt().toISOString(),
        resource,
        season: null,
      },
    };
  }

  const clubId = positive(parameters, "clubId", true)!;
  const selectedSeason = season(parameters);
  const client = clientFor(clubId);

  if (resource === "competition") {
    const competitionId = positive(parameters, "competitionId", true)!;
    const [standings, clubs] = await Promise.all([
      client.standings(competitionId, { season: selectedSeason, refresh }),
      client.clubs({ refresh }),
    ]);
    const clubNames = new Map(clubs.map(({ id, name }) => [id, name]));
    return {
      data: {
        clubs: namedOptions(standings.entries.map((entry) => ({
          id: entry.clubId,
          name: clubNames.get(entry.clubId) ?? entry.team,
        }))),
      },
      meta: {
        cache: "persistent-nbb-stats",
        generatedAt: new Date().toISOString(),
        refreshAfter: isHistoricalSeason(selectedSeason, client.currentSeason)
          ? null
          : client.nextRefreshAt().toISOString(),
        resource,
        season: selectedSeason,
      },
    };
  }

  const [teams, competitions, games] = await Promise.all([
    client.teams({ season: selectedSeason, refresh }),
    client.competitions({ season: selectedSeason, refresh }),
    client.games({ clubId, season: selectedSeason, refresh }),
  ]);
  const locations = namedOptions(games.flatMap((game) => game.locationId && game.venue
    ? [{
        id: game.locationId,
        name: game.city ? `${game.venue} — ${game.city}` : game.venue,
      }]
    : []));
  const teamCompetitions = uniqueLinks(
    teams.map(({ id, competitionId }) => ({ teamId: id, competitionId })),
    (link) => `${link.teamId}:${link.competitionId}`,
  );
  const gameFilters = uniqueLinks(games.flatMap((game) => {
    const teamId = game.homeClubId === clubId
      ? game.homeTeamId
      : game.awayClubId === clubId
        ? game.awayTeamId
        : undefined;
    return teamId === undefined ? [] : [{
      competitionId: game.competitionId,
      completed: game.completed,
      ...(game.locationId === undefined ? {} : { locationId: game.locationId }),
      startAt: game.startAt,
      teamId,
      venue: game.homeClubId === clubId ? "home" as const : "away" as const,
    }];
  }), (link) => `${link.teamId}:${link.competitionId}:${link.locationId ?? ""}:${link.venue}:${link.completed}:${link.startAt}`);
  return {
    data: {
      competitions: namedOptions(competitions.map(({ id, name }) => ({ id, name }))),
      gameFilters,
      locations,
      teamCompetitions,
      teams: namedOptions(teams.map(({ id, name }) => ({ id, name }))),
    },
    meta: {
      cache: "persistent-nbb-stats",
      generatedAt: new Date().toISOString(),
      refreshAfter: isHistoricalSeason(selectedSeason, client.currentSeason)
        ? null
        : client.nextRefreshAt().toISOString(),
      resource,
      season: selectedSeason,
    },
  };
}

export function isCacheMiss(error: unknown) {
  return error instanceof NbbCacheMissError;
}

export async function closeDataCache() {
  await cache.close();
}
