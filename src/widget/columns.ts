import type { WidgetLocale } from "./types";

export type ColumnDefinition<Key extends string> = {
  key: Key;
  label: Record<WidgetLocale, string>;
};

export const gameColumnDefinitions = [
  { key: "nr", label: { en: "Game no.", nl: "Wedstrijd nr" } },
  { key: "datum_f", label: { en: "Date", nl: "Datum" } },
  { key: "dag_nr", label: { en: "Day no.", nl: "Dag nr" } },
  { key: "dag", label: { en: "Day", nl: "Dag" } },
  { key: "maand_nr", label: { en: "Month no.", nl: "Maand nr" } },
  { key: "maand", label: { en: "Month", nl: "Maand" } },
  { key: "tijd", label: { en: "Time", nl: "Tijd" } },
  { key: "datum_tijd", label: { en: "Date & time", nl: "Datum & tijd" } },
  { key: "wed_letter", label: { en: "Game letter", nl: "Wedstrijdletter" } },
  { key: "cmp_id", label: { en: "Competition ID", nl: "Competitie ID" } },
  { key: "cmp_nr", label: { en: "Competition no.", nl: "Competitienummer" } },
  { key: "cmp_naam", label: { en: "Competition", nl: "Competitie" } },
  { key: "thuis_ploeg_id", label: { en: "Home team ID", nl: "Thuis team ID" } },
  { key: "thuis_ploeg", label: { en: "Home", nl: "Thuis" } },
  { key: "logo_thuis", label: { en: "Home logo", nl: "Logo thuis" } },
  { key: "uit_ploeg_id", label: { en: "Away team ID", nl: "Uit team ID" } },
  { key: "uit_ploeg", label: { en: "Away", nl: "Uit" } },
  { key: "logo_uit", label: { en: "Away logo", nl: "Logo uit" } },
  { key: "loc_id", label: { en: "Location ID", nl: "Locatie ID" } },
  { key: "loc_naam", label: { en: "Location", nl: "Locatie" } },
  { key: "veld", label: { en: "Court", nl: "Veld" } },
  { key: "loc_plaats", label: { en: "City", nl: "Plaats" } },
  { key: "lat", label: { en: "Latitude", nl: "Breedtegraad" } },
  { key: "lon", label: { en: "Longitude", nl: "Lengtegraad" } },
  { key: "uitslag", label: { en: "Result", nl: "Uitslag" } },
  { key: "score_thuis", label: { en: "Home score", nl: "Score thuis" } },
  { key: "score_uit", label: { en: "Away score", nl: "Score uit" } },
  { key: "score_thuis_1e_kwart", label: { en: "Home Q1", nl: "Score thuis 1e kwart" } },
  { key: "score_uit_1e_kwart", label: { en: "Away Q1", nl: "Score uit 1e kwart" } },
  { key: "score_thuis_rust", label: { en: "Home halftime", nl: "Score thuis rust" } },
  { key: "score_uit_rust", label: { en: "Away halftime", nl: "Score uit rust" } },
  { key: "score_thuis_3e_kwart", label: { en: "Home Q3", nl: "Score thuis 3e kwart" } },
  { key: "score_uit_3e_kwart", label: { en: "Away Q3", nl: "Score uit 3e kwart" } },
  { key: "datum", label: { en: "ISO date", nl: "Datum ISO" } },
  { key: "id", label: { en: "Game ID", nl: "Wedstrijd ID" } },
] as const satisfies readonly ColumnDefinition<string>[];

export const standingsColumnDefinitions = [
  { key: "positie", label: { en: "Position", nl: "Positie" } },
  { key: "rang", label: { en: "Rank", nl: "Rang" } },
  { key: "team", label: { en: "Team", nl: "Team" } },
  { key: "afko", label: { en: "Abbreviation", nl: "Afkorting" } },
  { key: "clb_id", label: { en: "Club ID", nl: "Club ID" } },
  { key: "status", label: { en: "Status", nl: "Status" } },
  { key: "logo", label: { en: "Logo", nl: "Logo" } },
  { key: "gespeeld", label: { en: "Played", nl: "Gespeeld" } },
  { key: "gewonnen", label: { en: "Won", nl: "Gewonnen" } },
  { key: "verloren", label: { en: "Lost", nl: "Verloren" } },
  { key: "gelijk", label: { en: "Drawn", nl: "Gelijk" } },
  { key: "punten", label: { en: "Points", nl: "Punten" } },
  { key: "percentage", label: { en: "Percentage", nl: "Percentage" } },
  { key: "eigenscore", label: { en: "For", nl: "Voor" } },
  { key: "tegenscore", label: { en: "Against", nl: "Tegen" } },
  { key: "saldo", label: { en: "Difference", nl: "Saldo" } },
  { key: "datum", label: { en: "Last game", nl: "Laatste wedstrijd" } },
  { key: "ID", label: { en: "Team ID", nl: "Team ID" } },
] as const satisfies readonly ColumnDefinition<string>[];

export type GameColumnKey = typeof gameColumnDefinitions[number]["key"];
export type StandingsColumnKey = typeof standingsColumnDefinitions[number]["key"];

export const defaultGameColumns: GameColumnKey[] = [
  "datum_f", "tijd", "thuis_ploeg", "uit_ploeg", "uitslag", "loc_naam",
];

export const defaultStandingsColumns: StandingsColumnKey[] = [
  "rang", "team", "gespeeld", "punten", "percentage", "saldo",
];

export const gameColumnKeys = gameColumnDefinitions.map(({ key }) => key);
export const standingsColumnKeys = standingsColumnDefinitions.map(({ key }) => key);
