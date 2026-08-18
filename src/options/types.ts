export type NamedOption = {
  id: number;
  name: string;
};

export type OptionsMeta = {
  cache: "persistent-nbb-stats";
  generatedAt: string;
  refreshAfter: string | null;
  resource: "club" | "clubs" | "competition";
  season: string | null;
};

export type GameFilterLink = {
  competitionId: number;
  completed: boolean;
  locationId?: number;
  startAt: string;
  teamId: number;
  venue: "away" | "home";
};

export type TeamCompetitionLink = {
  competitionId: number;
  teamId: number;
};

export type ClubsOptionsResponse = {
  data: NamedOption[];
  meta: OptionsMeta & { resource: "clubs" };
};

export type ClubOptionsResponse = {
  data: {
    competitions: NamedOption[];
    gameFilters: GameFilterLink[];
    locations: NamedOption[];
    teamCompetitions: TeamCompetitionLink[];
    teams: NamedOption[];
  };
  meta: OptionsMeta & { resource: "club"; season: string };
};

export type CompetitionOptionsResponse = {
  data: {
    clubs: NamedOption[];
  };
  meta: OptionsMeta & { resource: "competition"; season: string };
};

export type SelectionOptionsResponse =
  | ClubsOptionsResponse
  | ClubOptionsResponse
  | CompetitionOptionsResponse;
