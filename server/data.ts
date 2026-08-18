import {
  isHistoricalSeason,
  NBBStats,
  NbbCacheMissError,
  SqliteCache,
  type NbbGame,
  type NbbStandingEntry,
  type NbbStandings,
  type RefreshMode,
} from "nbb-stats";

import type { WidgetGame, WidgetResponse, WidgetStanding } from "../src/widget/types";
import { serverConfig } from "./config";

const config = serverConfig();
const cache = new SqliteCache({ filename: config.cacheFile });
const clients = new Map<number, NBBStats>();

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

function gameWithoutPrivateFields({ raw: _raw, homeLogo: _homeLogo, awayLogo: _awayLogo, quarterScores: _quarterScores, ...game }: NbbGame): WidgetGame {
  return game;
}

function standingWithoutPrivateFields({ raw: _raw, logo: _logo, percentage: _percentage, ...entry }: NbbStandingEntry): WidgetStanding {
  return entry;
}

function standingsWithoutPrivateFields({ raw: _raw, competitionNumber: _number, entries, ...standings }: NbbStandings) {
  return { ...standings, entries: entries.map(standingWithoutPrivateFields) };
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
  clubId: number,
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
  const clubId = positive(parameters, "clubId", true)!;
  const selectedSeason = season(parameters);
  const resource = choice(parameters, "resource", ["games", "standings"] as const, "games");
  const client = clientFor(clubId);

  if (resource === "games") {
    const teamId = positive(parameters, "teamId");
    const competitionId = positive(parameters, "competitionId");
    const view = choice(parameters, "view", ["all", "results", "upcoming"] as const, "all");
    const venue = choice(parameters, "venue", ["all", "away", "home"] as const, "all");
    const limit = Math.min(50, positive(parameters, "limit") ?? 7);
    const now = Date.now();
    const data = (await client.clubGames({ season: selectedSeason, refresh }))
      .filter((game) => teamId === undefined || game.homeTeamId === teamId || game.awayTeamId === teamId)
      .filter((game) => competitionId === undefined || game.competitionId === competitionId)
      .filter((game) => venue === "all" || game.selectedClubAtHome === (venue === "home"))
      .filter((game) => {
        if (view === "results") return game.completed;
        if (view === "upcoming") return !game.completed && Date.parse(game.startAt) >= now;
        return true;
      })
      .sort((left, right) => {
        const difference = Date.parse(left.startAt) - Date.parse(right.startAt);
        return view === "results" ? -difference : difference;
      })
      .slice(0, limit)
      .map(gameWithoutPrivateFields);
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

export function isCacheMiss(error: unknown) {
  return error instanceof NbbCacheMissError;
}

export async function closeDataCache() {
  await cache.close();
}
