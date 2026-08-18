import type { GameColumnKey, StandingsColumnKey } from "./columns";

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
  clubId?: number;
  season: string;
  locale: WidgetLocale;
  theme: WidgetTheme;
  accent: string;
};

export type GamesWidgetConfig = CommonWidgetConfig & {
  columns: GameColumnKey[];
  competitionId?: number;
  enableSorting: boolean;
  evenRowColor: string;
  groupByWeek: boolean;
  kind: "games";
  layout: GamesLayout;
  limit?: number;
  locationId?: number;
  oddRowColor: string;
  tableClass: string;
  teamId?: number;
  venue: GamesVenue;
  view: GamesView;
};

export type StandingsWidgetConfig = CommonWidgetConfig & {
  columns: StandingsColumnKey[];
  kind: "standings";
  competitionId: number;
  enableSorting: boolean;
  evenRowColor: string;
  highlightColor: string;
  highlightClubId?: number;
  layout: StandingsLayout;
  oddRowColor: string;
  records: boolean;
  showMeta: boolean;
  tableClass: string;
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
  homeLogo?: string;
  awayLogo?: string;
  homeScore?: number;
  awayScore?: number;
  venue?: string;
  city?: string;
  court?: string;
  locationId?: number;
  latitude?: number;
  longitude?: number;
  competitionId: number;
  competitionName?: string;
  competitionNumber?: string;
  gameLetter?: string;
  gameNumber?: string;
  quarterScores?: Array<{
    label: string;
    home?: number;
    away?: number;
  }>;
  selectedClubAtHome: boolean;
  completed: boolean;
};

export type WidgetStanding = {
  teamId: number;
  clubId: number;
  position: number;
  rank: number;
  team: string;
  abbreviation?: string;
  status?: string;
  logo?: string;
  lastGameAt?: string;
  played: number;
  wins?: number;
  losses?: number;
  draws?: number;
  points: number;
  pointsFor: number;
  pointsAgainst: number;
  difference: number;
  percentage?: number;
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
  clubId?: number;
  generatedAt: string;
  refreshAfter: string | null;
  resource: "games" | "standings";
  season: string;
};

export type WidgetResponse = GamesResponse | StandingsResponse;
