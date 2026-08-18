export type WidgetLocale = "en" | "nl";
export type WidgetTheme = "auto" | "dark" | "light";
export type GamesLayout = "cards" | "table";
export type GamesView = "all" | "results" | "upcoming";
export type GamesVenue = "all" | "away" | "home";
export type StandingsLayout = "bars" | "combined" | "table";

type CommonWidgetConfig = {
  /**
   * Optional cached NBB-Stats gateway. The configurator supplies this for its
   * live preview. Generated embeds omit it and read Basketballstats JSON
   * directly, protected by the widget's browser cache and request gate.
   */
  apiUrl?: string;
  clubId: number;
  season: string;
  locale: WidgetLocale;
  theme: WidgetTheme;
  accent: string;
};

export type GamesWidgetConfig = CommonWidgetConfig & {
  kind: "games";
  competitionId?: number;
  layout: GamesLayout;
  limit: number;
  teamId?: number;
  venue: GamesVenue;
  view: GamesView;
};

export type StandingsWidgetConfig = CommonWidgetConfig & {
  kind: "standings";
  competitionId: number;
  highlightClubId?: number;
  layout: StandingsLayout;
  records: boolean;
};

export type WidgetConfig = GamesWidgetConfig | StandingsWidgetConfig;

export type WidgetGame = {
  id: string;
  season: string;
  startAt: string;
  homeTeam: string;
  awayTeam: string;
  homeTeamId: number;
  awayTeamId: number;
  homeClubId: number;
  awayClubId: number;
  homeScore?: number;
  awayScore?: number;
  venue?: string;
  city?: string;
  competitionId: number;
  selectedClubAtHome: boolean;
  completed: boolean;
};

export type WidgetStanding = {
  teamId: number;
  clubId: number;
  position: number;
  team: string;
  abbreviation?: string;
  played: number;
  wins?: number;
  losses?: number;
  draws?: number;
  points: number;
  pointsFor: number;
  pointsAgainst: number;
  difference: number;
};

export type GamesResponse = {
  data: WidgetGame[];
  meta: WidgetMeta & { resource: "games" };
};

export type StandingsResponse = {
  data: {
    competitionId: number;
    name?: string;
    season: string;
    entries: WidgetStanding[];
  };
  meta: WidgetMeta & { resource: "standings" };
};

export type WidgetMeta = {
  cache: "browser-direct" | "persistent-nbb-stats";
  clubId: number;
  generatedAt: string;
  refreshAfter: string | null;
  resource: "games" | "standings";
  season: string;
};

export type WidgetResponse = GamesResponse | StandingsResponse;
