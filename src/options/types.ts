export type NamedOption = {
  id: number;
  name: string;
};

export type OptionsMeta = {
  cache: "persistent-nbb-stats";
  generatedAt: string;
  refreshAfter: string | null;
  resource: "club" | "clubs";
  season: string | null;
};

export type ClubsOptionsResponse = {
  data: NamedOption[];
  meta: OptionsMeta & { resource: "clubs" };
};

export type ClubOptionsResponse = {
  data: {
    competitions: NamedOption[];
    locations: NamedOption[];
    teams: NamedOption[];
  };
  meta: OptionsMeta & { resource: "club"; season: string };
};

export type SelectionOptionsResponse = ClubsOptionsResponse | ClubOptionsResponse;
