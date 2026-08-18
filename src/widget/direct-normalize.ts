import type {
  GamesResponse,
  GamesWidgetConfig,
  StandingsResponse,
  StandingsWidgetConfig,
  WidgetConfig,
  WidgetGame,
  WidgetResponse,
  WidgetStanding,
} from "./types";

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : undefined;
}

function objectsAt(payload: unknown, keys: string[]) {
  const root = object(payload);
  if (!root) throw new TypeError("Basketballstats returned invalid JSON");
  for (const key of keys) {
    const value = root[key];
    if (Array.isArray(value)) {
      return value.map(object).filter((entry): entry is JsonObject => entry !== undefined);
    }
  }
  return [];
}

function valueAt(raw: JsonObject, keys: string[]) {
  for (const key of keys) {
    const value = raw[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function textAt(raw: JsonObject, keys: string[], fallback = "") {
  const value = valueAt(raw, keys);
  return value === undefined ? fallback : String(value);
}

function numberAt(raw: JsonObject, keys: string[], fallback?: number) {
  const parsed = Number(valueAt(raw, keys));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function requiredNumber(raw: JsonObject, keys: string[], label: string) {
  const value = numberAt(raw, keys);
  if (value === undefined) throw new TypeError(`Basketballstats response is missing ${label}`);
  return value;
}

function zonedParts(date: Date, timeZone = "Europe/Amsterdam") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(date);
  const part = (name: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((entry) => entry.type === name)?.value);
  return {
    day: part("day"),
    hour: part("hour"),
    minute: part("minute"),
    month: part("month"),
    second: part("second"),
    year: part("year"),
  };
}

function amsterdamDateTimeToIso(value: string) {
  const trimmed = value.trim();
  if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(trimmed)) {
    const parsed = new Date(trimmed);
    if (Number.isFinite(parsed.getTime())) return parsed.toISOString();
  }
  const match = trimmed.match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/,
  );
  if (!match) return value;
  const target = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6] ?? 0),
  );
  let guess = target;
  for (let pass = 0; pass < 2; pass += 1) {
    const local = zonedParts(new Date(guess));
    const represented = Date.UTC(
      local.year,
      local.month - 1,
      local.day,
      local.hour,
      local.minute,
      local.second,
    );
    guess += target - represented;
  }
  return new Date(guess).toISOString();
}

function inferCurrentSeason(now = new Date()) {
  const local = zonedParts(now);
  const start = local.month >= 7 ? local.year : local.year - 1;
  return `${start}-${start + 1}`;
}

/**
 * Match the source import schedule documented by Jaap: after 00:30 Europe/
 * Amsterdam each day and, during weekends, after the additional 17:00 run.
 */
export function directRefreshAfter(season: string, now = new Date()) {
  if (season < inferCurrentSeason(now)) return null;
  const local = zonedParts(now);
  const localDay = new Date(Date.UTC(local.year, local.month - 1, local.day));
  const candidates: Date[] = [];

  for (let offset = 0; offset <= 8; offset += 1) {
    const day = new Date(localDay);
    day.setUTCDate(day.getUTCDate() + offset);
    const clocks = day.getUTCDay() === 0 || day.getUTCDay() === 6
      ? [[0, 30], [17, 0]] as const
      : [[0, 30]] as const;
    for (const [hour, minute] of clocks) {
      const target = Date.UTC(
        day.getUTCFullYear(),
        day.getUTCMonth(),
        day.getUTCDate(),
        hour,
        minute,
      );
      let guess = target;
      for (let pass = 0; pass < 2; pass += 1) {
        const represented = zonedParts(new Date(guess));
        guess += target - Date.UTC(
          represented.year,
          represented.month - 1,
          represented.day,
          represented.hour,
          represented.minute,
          represented.second,
        );
      }
      const candidate = new Date(guess);
      if (candidate.getTime() > now.getTime()) candidates.push(candidate);
    }
  }
  candidates.sort((left, right) => left.getTime() - right.getTime());
  return candidates[0]?.toISOString() ?? new Date(now.getTime() + 12 * 60 * 60 * 1_000).toISOString();
}

function games(payload: unknown, config: GamesWidgetConfig, now: Date): GamesResponse {
  const root = object(payload);
  const season = root ? textAt(root, ["seizoen", "szn_Naam"], config.season) : config.season;
  const data = objectsAt(payload, ["wedstrijden", "games"]).map((raw): WidgetGame => {
    const homeScore = numberAt(raw, ["score_thuis"]);
    const awayScore = numberAt(raw, ["score_uit"]);
    const homeClubId = requiredNumber(raw, ["thuis_club_id"], "home club ID");
    const quarterScores = [
      { label: "Q1", home: numberAt(raw, ["score_thuis_1e_kwart"]), away: numberAt(raw, ["score_uit_1e_kwart"]) },
      { label: "HT", home: numberAt(raw, ["score_thuis_rust"]), away: numberAt(raw, ["score_uit_rust"]) },
      { label: "Q3", home: numberAt(raw, ["score_thuis_3e_kwart"]), away: numberAt(raw, ["score_uit_3e_kwart"]) },
      { label: "FT", home: homeScore, away: awayScore },
    ].map(({ label, home, away }) => ({
      label,
      ...(home === undefined ? {} : { home }),
      ...(away === undefined ? {} : { away }),
    }));
    return {
      id: textAt(raw, ["id", "wed_ID"]),
      season,
      startAt: amsterdamDateTimeToIso(textAt(raw, ["datum"])),
      homeTeam: textAt(raw, ["thuis_ploeg"]),
      awayTeam: textAt(raw, ["uit_ploeg"]),
      homeTeamId: requiredNumber(raw, ["thuis_ploeg_id"], "home team ID"),
      awayTeamId: requiredNumber(raw, ["uit_ploeg_id"], "away team ID"),
      homeClubId,
      awayClubId: requiredNumber(raw, ["uit_club_id"], "away club ID"),
      ...(textAt(raw, ["logo_thuis"]) ? { homeLogo: textAt(raw, ["logo_thuis"]) } : {}),
      ...(textAt(raw, ["logo_uit"]) ? { awayLogo: textAt(raw, ["logo_uit"]) } : {}),
      ...(homeScore === undefined ? {} : { homeScore }),
      ...(awayScore === undefined ? {} : { awayScore }),
      ...(textAt(raw, ["loc_naam"]) ? { venue: textAt(raw, ["loc_naam"]) } : {}),
      ...(textAt(raw, ["loc_plaats"]) ? { city: textAt(raw, ["loc_plaats"]) } : {}),
      ...(textAt(raw, ["veld"]) ? { court: textAt(raw, ["veld"]) } : {}),
      ...(numberAt(raw, ["loc_id"]) === undefined ? {} : { locationId: numberAt(raw, ["loc_id"]) }),
      ...(numberAt(raw, ["lat"]) === undefined ? {} : { latitude: numberAt(raw, ["lat"]) }),
      ...(numberAt(raw, ["lon"]) === undefined ? {} : { longitude: numberAt(raw, ["lon"]) }),
      competitionId: requiredNumber(raw, ["cmp_id", "cmp_ID"], "competition ID"),
      ...(textAt(raw, ["cmp_naam"]) ? { competitionName: textAt(raw, ["cmp_naam"]) } : {}),
      ...(textAt(raw, ["cmp_nr"]) ? { competitionNumber: textAt(raw, ["cmp_nr"]) } : {}),
      ...(textAt(raw, ["wed_letter"]) ? { gameLetter: textAt(raw, ["wed_letter"]) } : {}),
      ...(textAt(raw, ["nr", "wed_nr"]) ? { gameNumber: textAt(raw, ["nr", "wed_nr"]) } : {}),
      quarterScores,
      selectedClubAtHome: config.clubId !== undefined && homeClubId === config.clubId,
      completed: homeScore !== undefined && awayScore !== undefined,
    };
  });
  return {
    data,
    meta: {
      cache: "browser-direct",
      clubId: config.clubId,
      generatedAt: now.toISOString(),
      refreshAfter: directRefreshAfter(season, now),
      resource: "games",
      season,
    },
  };
}

function standings(payload: unknown, config: StandingsWidgetConfig, now: Date): StandingsResponse {
  const root = object(payload);
  if (!root) throw new TypeError("Basketballstats returned invalid standings JSON");
  const season = textAt(root, ["seizoen", "szn_Naam"], config.season);
  const entries = objectsAt(payload, ["stand", "standings"])
    .map((raw): WidgetStanding => ({
      teamId: requiredNumber(raw, ["ID", "id", "plg_ID"], "team ID"),
      clubId: requiredNumber(raw, ["clb_id", "club_id"], "club ID"),
      position: requiredNumber(raw, ["positie", "position"], "position"),
      rank: numberAt(raw, ["rang"], requiredNumber(raw, ["positie", "position"], "position"))!,
      team: textAt(raw, ["team", "naam"]),
      ...(textAt(raw, ["afko"]) ? { abbreviation: textAt(raw, ["afko"]) } : {}),
      ...(textAt(raw, ["status"]) ? { status: textAt(raw, ["status"]) } : {}),
      ...(textAt(raw, ["logo"]) ? { logo: textAt(raw, ["logo"]) } : {}),
      ...(textAt(raw, ["datum"]) ? { lastGameAt: textAt(raw, ["datum"]) } : {}),
      played: numberAt(raw, ["gespeeld", "played"], 0) ?? 0,
      ...(numberAt(raw, ["gewonnen", "wins"]) === undefined
        ? {}
        : { wins: numberAt(raw, ["gewonnen", "wins"]) }),
      ...(numberAt(raw, ["verloren", "losses"]) === undefined
        ? {}
        : { losses: numberAt(raw, ["verloren", "losses"]) }),
      ...(numberAt(raw, ["gelijk", "draws"]) === undefined
        ? {}
        : { draws: numberAt(raw, ["gelijk", "draws"]) }),
      points: numberAt(raw, ["punten", "points"], 0) ?? 0,
      pointsFor: numberAt(raw, ["eigenscore", "points_for"], 0) ?? 0,
      pointsAgainst: numberAt(raw, ["tegenscore", "points_against"], 0) ?? 0,
      difference: numberAt(raw, ["saldo", "difference"], 0) ?? 0,
      ...(numberAt(raw, ["percentage"]) === undefined
        ? {}
        : { percentage: numberAt(raw, ["percentage"]) }),
    }))
    .sort((left, right) => left.position - right.position);
  return {
    data: {
      competitionId: config.competitionId,
      ...(textAt(root, ["naam", "competition"]) ? { name: textAt(root, ["naam", "competition"]) } : {}),
      season,
      entries,
    },
    meta: {
      cache: "browser-direct",
      clubId: config.clubId,
      generatedAt: now.toISOString(),
      refreshAfter: directRefreshAfter(season, now),
      resource: "standings",
      season,
    },
  };
}

export function normalizeBasketballstatsResponse(
  payload: unknown,
  config: WidgetConfig,
  now = new Date(),
): WidgetResponse {
  return config.kind === "games"
    ? games(payload, config, now)
    : standings(payload, config, now);
}

/** Apply display filters locally so changing a layout does not refetch data. */
export function visibleGames(games: WidgetGame[], config: GamesWidgetConfig, now = Date.now()) {
  return games
    .filter((game) => config.clubId === undefined
      || game.homeClubId === config.clubId
      || game.awayClubId === config.clubId)
    .filter((game) => config.teamId === undefined
      || game.homeTeamId === config.teamId
      || game.awayTeamId === config.teamId)
    .filter((game) => config.competitionId === undefined
      || game.competitionId === config.competitionId)
    .filter((game) => config.locationId === undefined
      || game.locationId === config.locationId)
    .filter((game) => config.venue === "all"
      || (config.clubId !== undefined
        && (config.venue === "home"
          ? game.homeClubId === config.clubId
          : game.awayClubId === config.clubId)))
    .filter((game) => {
      if (config.view === "results") return game.completed;
      if (config.view === "upcoming") return !game.completed && Date.parse(game.startAt) >= now;
      return true;
    })
    .sort((left, right) => {
      const difference = Date.parse(left.startAt) - Date.parse(right.startAt);
      return config.view === "results" ? -difference : difference;
    })
    .slice(0, config.limit ?? games.length);
}

export function withCalculatedRecords(
  response: StandingsResponse,
  games: WidgetGame[],
): StandingsResponse {
  const records = new Map<number, { draws: number; losses: number; wins: number }>();
  const record = (teamId: number) => {
    const current = records.get(teamId) ?? { draws: 0, losses: 0, wins: 0 };
    records.set(teamId, current);
    return current;
  };
  for (const game of games) {
    if (!game.completed || game.homeScore === undefined || game.awayScore === undefined) continue;
    const home = record(game.homeTeamId);
    const away = record(game.awayTeamId);
    if (game.homeScore === game.awayScore) {
      home.draws += 1;
      away.draws += 1;
    } else if (game.homeScore > game.awayScore) {
      home.wins += 1;
      away.losses += 1;
    } else {
      away.wins += 1;
      home.losses += 1;
    }
  }
  return {
    ...response,
    data: {
      ...response.data,
      entries: response.data.entries.map((entry) => ({
        ...entry,
        ...(records.get(entry.teamId) ?? { draws: 0, losses: 0, wins: 0 }),
      })),
    },
  };
}
