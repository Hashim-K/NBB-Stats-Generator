// @vitest-environment happy-dom

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  NBB_STATS_WIDGET_SCRIPT_URL,
  generateSnippet,
  widgetRequestUrl,
} from "../src/generator/snippet";
import { readResponseCache, writeResponseCache } from "../src/widget/cache";
import {
  directRefreshAfter,
  normalizeBasketballstatsResponse,
  visibleGames,
  withCalculatedRecords,
} from "../src/widget/direct-normalize";
import { defaultGameColumns, defaultStandingsColumns } from "../src/widget/columns";
import { registerNbbStatsWidget } from "../src/widget/element";
import {
  requestScope,
  reserveBrowserRequestSlot,
} from "../src/widget/throttle";
import type { GamesResponse, GamesWidgetConfig, StandingsResponse } from "../src/widget/types";

class TestStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

const gamesConfig: GamesWidgetConfig = {
  accent: "#ef4b23",
  clubId: 57,
  columns: defaultGameColumns,
  enableSorting: true,
  evenRowColor: "#ffffff",
  groupByWeek: false,
  kind: "games",
  layout: "cards",
  limit: 7,
  locale: "nl",
  oddRowColor: "#f2f4f7",
  season: "2026-2027",
  tableClass: "wedstrijd-table",
  theme: "auto",
  venue: "all",
  view: "upcoming",
};

const rawGames = {
  seizoen: "2026-2027",
  wedstrijden: [
    {
      id: 540825,
      datum: "2026-08-23 15:00:00.000",
      thuis_ploeg: "Punch MSE 1",
      uit_ploeg: "DAS MSE 1",
      thuis_club_id: 57,
      uit_club_id: 47,
      thuis_ploeg_id: 251,
      uit_ploeg_id: 1709,
      cmp_id: 4180,
      loc_naam: "X TU Delft",
    },
    {
      id: 540824,
      datum: "2026-08-16 15:00:00.000",
      thuis_ploeg: "DAS MSE 1",
      uit_ploeg: "Punch MSE 1",
      thuis_club_id: 47,
      uit_club_id: 57,
      thuis_ploeg_id: 1709,
      uit_ploeg_id: 251,
      cmp_id: 4180,
      score_thuis: 74,
      score_uit: 81,
    },
  ],
};

beforeAll(() => {
  const storage = new TestStorage();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
  Object.defineProperty(window, "localStorage", { configurable: true, value: storage });
  registerNbbStatsWidget();
});

afterEach(() => {
  localStorage.clear();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("generated embed data path", () => {
  it("loads our widget script without the preview gateway", () => {
    const snippet = generateSnippet(gamesConfig);
    expect(snippet).toContain(`src="${NBB_STATS_WIDGET_SCRIPT_URL}"`);
    expect(snippet).not.toContain("basketballstats.nl/db/json/nbb-stats-widget.js");
    expect(snippet).toContain("<nbb-games");
    expect(snippet).not.toContain("api-url");
    expect(snippet).toContain('columns="datum_f,tijd,thuis_ploeg,uit_ploeg,uitslag,loc_naam"');
    expect(snippet).toContain('enable-sorting="true"');
    expect(snippet).toContain('table-class="wedstrijd-table"');
  });

  it("supports Jaap's four alternative games filters and rejects an unbounded query", () => {
    const locationOnly = { ...gamesConfig, clubId: undefined, limit: undefined, locationId: 20 };
    const direct = widgetRequestUrl(locationOnly, "https://club.example");
    expect(direct.searchParams.get("loc_ID")).toBe("20");
    expect(direct.searchParams.has("clb_ID")).toBe(false);
    expect(() => generateSnippet({ ...locationOnly, locationId: undefined }))
      .toThrow("games require a club, team, competition, or location");
  });

  it("uses direct Basketballstats JSON for embeds and NBB-Stats for previews", () => {
    const direct = widgetRequestUrl(gamesConfig, "https://club.example/schedule");
    expect(direct.hostname).toBe("api.basketballstats.nl");
    expect(direct.searchParams.get("clb_ID")).toBe("57");
    expect(direct.searchParams.get("origin")).toBe("https://club.example");

    const preview = widgetRequestUrl({
      ...gamesConfig,
      apiUrl: "https://generator.example/api/nbb-stats",
    });
    expect(preview.origin).toBe("https://generator.example");
    expect(preview.searchParams.get("resource")).toBe("games");
    expect(widgetRequestUrl({
      ...gamesConfig,
      apiUrl: "https://generator.example/api/nbb-stats",
      limit: 1,
      venue: "home",
      view: "results",
    }).toString()).toBe(preview.toString());
  });

  it("uses an unsent fragment to separate standings-with-records browser cache entries", () => {
    const url = widgetRequestUrl({
      accent: "#ef4b23",
      clubId: 57,
      columns: defaultStandingsColumns,
      competitionId: 4180,
      enableSorting: true,
      evenRowColor: "#ffffff",
      highlightColor: "#fff3cd",
      kind: "standings",
      layout: "combined",
      locale: "nl",
      oddRowColor: "#f2f4f7",
      records: true,
      season: "2026-2027",
      showMeta: false,
      tableClass: "stand-table",
      theme: "auto",
    }, "https://club.example");
    expect(url.hostname).toBe("www.basketballstats.nl");
    expect(url.searchParams.get("cmp_ID")).toBe("4180");
    expect(url.hash).toBe("#records");
  });
});

describe("direct response protection", () => {
  it("normalizes source JSON and applies display filters locally", () => {
    const payload = normalizeBasketballstatsResponse(
      rawGames,
      gamesConfig,
      new Date("2026-08-18T12:00:00.000Z"),
    ) as GamesResponse;
    expect(payload.meta).toMatchObject({
      cache: "browser-direct",
      resource: "games",
    });
    expect(payload.data[0]).toMatchObject({
      homeTeam: "Punch MSE 1",
      selectedClubAtHome: true,
      startAt: "2026-08-23T13:00:00.000Z",
    });
    expect(visibleGames(payload.data, gamesConfig, Date.parse("2026-08-18T12:00:00Z")))
      .toHaveLength(1);
    expect(visibleGames(payload.data, { ...gamesConfig, view: "results" }))
      .toHaveLength(1);
  });

  it("retains historical responses forever and current data until the source refresh", () => {
    const now = new Date("2026-08-18T12:00:00.000Z");
    expect(directRefreshAfter("2025-2026", now)).toBeNull();
    expect(directRefreshAfter("2026-2027", now)).toBe("2026-08-18T22:30:00.000Z");
  });

  it("calculates W-L-D from cached competition games", () => {
    const response = normalizeBasketballstatsResponse({
      seizoen: "2026-2027",
      stand: [
        { ID: 251, clb_id: 57, positie: 1, team: "Punch MSE 1", gespeeld: 1, punten: 2 },
        { ID: 1709, clb_id: 47, positie: 2, team: "DAS MSE 1", gespeeld: 1, punten: 0 },
      ],
    }, {
      accent: "#ef4b23",
      clubId: 57,
      columns: defaultStandingsColumns,
      competitionId: 4180,
      enableSorting: true,
      evenRowColor: "#ffffff",
      highlightColor: "#fff3cd",
      kind: "standings",
      layout: "table",
      locale: "nl",
      oddRowColor: "#f2f4f7",
      records: true,
      season: "2026-2027",
      showMeta: false,
      tableClass: "stand-table",
      theme: "auto",
    }, new Date("2026-08-18T12:00:00Z")) as StandingsResponse;
    const gameResponse = normalizeBasketballstatsResponse(rawGames, gamesConfig) as GamesResponse;
    const enriched = withCalculatedRecords(response, gameResponse.data);
    expect(enriched.data.entries[0]).toMatchObject({ wins: 1, losses: 0, draws: 0 });
    expect(enriched.data.entries[1]).toMatchObject({ wins: 0, losses: 1, draws: 0 });
  });

  it("shares one 15-second budget across Basketballstats subdomains", async () => {
    expect(requestScope("https://api.basketballstats.nl/db/json/wedstrijd.pl"))
      .toBe(requestScope("https://www.basketballstats.nl/db/json/stand.pl"));
    const storage = new TestStorage();
    let clock = 1_000;
    const waits: number[] = [];
    const options = {
      intervalMs: 15_000,
      now: () => clock,
      sleep: async (milliseconds: number) => {
        waits.push(milliseconds);
        clock += milliseconds;
      },
      storage,
    };
    await reserveBrowserRequestSlot("https://api.basketballstats.nl/db/json/wedstrijd.pl", options);
    clock = 4_000;
    await reserveBrowserRequestSlot("https://www.basketballstats.nl/db/json/stand.pl", options);
    expect(waits).toEqual([12_000]);
  });

  it("renders a fresh direct response from localStorage without fetching", async () => {
    const url = widgetRequestUrl(gamesConfig, document.baseURI).toString();
    const payload = normalizeBasketballstatsResponse(
      rawGames,
      gamesConfig,
      new Date("2026-08-18T12:00:00.000Z"),
    ) as GamesResponse;
    const cached: GamesResponse = {
      ...payload,
      meta: { ...payload.meta, refreshAfter: null },
    };
    writeResponseCache(url, cached);
    const fetch = vi.spyOn(globalThis, "fetch");
    const widget = document.createElement("nbb-games");
    widget.setAttribute("club-id", "57");
    widget.setAttribute("season", "2026-2027");
    document.body.append(widget);
    await Promise.resolve();
    await Promise.resolve();
    expect(readResponseCache(url)?.fresh).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
    expect(widget.shadowRoot?.textContent).toContain("Punch MSE 1");
  });
});
