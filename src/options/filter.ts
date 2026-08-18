import type { ClubOptionsResponse, NamedOption } from "./types";

export type GuidedFilterSelection = {
  competitionId?: number;
  locationId?: number;
  teamId?: number;
  venue?: "all" | "away" | "home";
  view?: "all" | "results" | "upcoming";
};

function retain(options: NamedOption[], ids?: Set<number>) {
  return ids ? options.filter(({ id }) => ids.has(id)) : options;
}

/**
 * Keep every guided dropdown compatible with the other selected dimensions.
 * Team/competition registrations remain available before games are scheduled;
 * location combinations necessarily come from actual games.
 */
export function choicesWithinSelection(
  data: ClubOptionsResponse["data"],
  selection: GuidedFilterSelection,
  now = Date.now(),
) {
  const {
    competitionId,
    locationId,
    teamId,
    venue = "all",
    view = "all",
  } = selection;
  const matchesView = (link: ClubOptionsResponse["data"]["gameFilters"][number]) => {
    if (view === "results") return link.completed;
    if (view === "upcoming") return !link.completed && Date.parse(link.startAt) >= now;
    return true;
  };
  const matchesVenue = (link: ClubOptionsResponse["data"]["gameFilters"][number]) =>
    venue === "all" || link.venue === venue;
  const usesGameAvailability = locationId !== undefined || venue !== "all" || view !== "all";

  const teamIds = usesGameAvailability
    ? new Set(data.gameFilters
        .filter((link) => locationId === undefined || link.locationId === locationId)
        .filter((link) => competitionId === undefined || link.competitionId === competitionId)
        .filter(matchesVenue)
        .filter(matchesView)
        .map((link) => link.teamId))
    : competitionId !== undefined
      ? new Set(data.teamCompetitions
          .filter((link) => link.competitionId === competitionId)
          .map((link) => link.teamId))
      : undefined;

  const competitionIds = usesGameAvailability
    ? new Set(data.gameFilters
        .filter((link) => locationId === undefined || link.locationId === locationId)
        .filter((link) => teamId === undefined || link.teamId === teamId)
        .filter(matchesVenue)
        .filter(matchesView)
        .map((link) => link.competitionId))
    : teamId !== undefined
      ? new Set(data.teamCompetitions
          .filter((link) => link.teamId === teamId)
          .map((link) => link.competitionId))
      : undefined;

  const locationIds = teamId !== undefined || competitionId !== undefined
    ? new Set(data.gameFilters
        .filter((link) => teamId === undefined || link.teamId === teamId)
        .filter((link) => competitionId === undefined || link.competitionId === competitionId)
        .filter(matchesVenue)
        .filter(matchesView)
        .flatMap((link) => link.locationId === undefined ? [] : [link.locationId]))
    : venue !== "all" || view !== "all"
      ? new Set(data.gameFilters
          .filter(matchesVenue)
          .filter(matchesView)
          .flatMap((link) => link.locationId === undefined ? [] : [link.locationId]))
      : undefined;

  const selectedGames = data.gameFilters
    .filter((link) => teamId === undefined || link.teamId === teamId)
    .filter((link) => competitionId === undefined || link.competitionId === competitionId)
    .filter((link) => locationId === undefined || link.locationId === locationId);
  const gamesForVenue = selectedGames.filter(matchesView);
  const gamesForView = selectedGames.filter(matchesVenue);

  return {
    competitions: retain(data.competitions, competitionIds),
    locations: retain(data.locations, locationIds),
    teams: retain(data.teams, teamIds),
    venues: {
      away: gamesForVenue.some((link) => link.venue === "away"),
      home: gamesForVenue.some((link) => link.venue === "home"),
    },
    views: {
      results: gamesForView.some((link) => link.completed),
      upcoming: gamesForView.some((link) => !link.completed && Date.parse(link.startAt) >= now),
    },
  };
}
