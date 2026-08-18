import { useEffect, useMemo, useRef, useState } from "react";

import {
  NBB_STATS_WIDGET_SCRIPT_URL,
  generateSnippet,
} from "./generator/snippet";
import type {
  ClubOptionsResponse,
  ClubsOptionsResponse,
  NamedOption,
} from "./options/types";
import {
  defaultGameColumns,
  defaultStandingsColumns,
  gameColumnDefinitions,
  standingsColumnDefinitions,
  type ColumnDefinition,
  type GameColumnKey,
  type StandingsColumnKey,
} from "./widget/columns";
import type {
  GamesWidgetConfig,
  StandingsWidgetConfig,
  WidgetConfig,
} from "./widget/types";

const JAAP_DEFAULT_SEASON = "2025-2026";
const JAAP_DEFAULT_COMPETITION = "3498";

function inferredSeason() {
  const now = new Date();
  const start = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  return `${start}-${start + 1}`;
}

function availableSeasons() {
  const latest = Number(inferredSeason().slice(0, 4));
  return Array.from({ length: latest - 1949 }, (_, index) => {
    const start = latest - index;
    return `${start}-${start + 1}`;
  });
}

function positiveOrUndefined(value: string) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function attribute(name: string, value: string | number | boolean | undefined) {
  if (value === undefined || value === "") return undefined;
  return [name, String(value)] as const;
}

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, value]);
  return debounced;
}

function WidgetPreview({ config }: { config?: WidgetConfig }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!host.current) return;
    if (!config) {
      host.current.replaceChildren();
      return;
    }
    const element = document.createElement(config.kind === "games" ? "nbb-games" : "nbb-standings");
    const common = [
      attribute("api-url", config.apiUrl),
      attribute("club-id", config.clubId),
      attribute("season", config.season),
      attribute("locale", config.locale),
      attribute("theme", config.theme),
      attribute("accent", config.accent),
    ];
    const specific = config.kind === "games"
      ? [
          attribute("team-id", config.teamId),
          attribute("competition-id", config.competitionId),
          attribute("location-id", config.locationId),
          attribute("layout", config.layout),
          attribute("limit", config.limit),
          attribute("venue", config.venue),
          attribute("view", config.view),
          attribute("columns", config.columns.join(",")),
          attribute("enable-sorting", config.enableSorting),
          attribute("even-row-color", config.evenRowColor),
          attribute("odd-row-color", config.oddRowColor),
          attribute("group-by-week", config.groupByWeek),
          attribute("table-class", config.tableClass),
        ]
      : [
          attribute("competition-id", config.competitionId),
          attribute("highlight-club-id", config.highlightClubId),
          attribute("layout", config.layout),
          attribute("columns", config.columns.join(",")),
          attribute("enable-sorting", config.enableSorting),
          attribute("even-row-color", config.evenRowColor),
          attribute("odd-row-color", config.oddRowColor),
          attribute("highlight-color", config.highlightColor),
          attribute("show-meta", config.showMeta),
          attribute("table-class", config.tableClass),
          config.records ? (["records", ""] as const) : undefined,
        ];
    [...common, ...specific]
      .filter((entry): entry is readonly [string, string] => Boolean(entry))
      .forEach(([name, value]) => element.setAttribute(name, value));
    host.current.replaceChildren(element);
    return () => element.remove();
  }, [config]);

  if (!config) {
    return (
      <div className="preview-empty">
        <span className="preview-ball" aria-hidden="true" />
        <strong>Complete the required data fields</strong>
        <p>The rendered widget will appear here and update automatically as you change its settings.</p>
      </div>
    );
  }
  return <div ref={host} className="widget-mount" />;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

function Select({ value, onChange, children, disabled }: {
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return <select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>{children}</select>;
}

function Toggle({ checked, label, hint, onChange }: {
  checked: boolean;
  label: string;
  hint?: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="toggle-field">
      <span><strong>{label}</strong>{hint ? <small>{hint}</small> : null}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

function NamedSelect({ value, options, emptyLabel, onChange, disabled }: {
  value: string;
  options: NamedOption[];
  emptyLabel: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const selected = positiveOrUndefined(value);
  const unresolved = selected !== undefined && !options.some(({ id }) => id === selected);
  return (
    <Select value={value} onChange={onChange} disabled={disabled}>
      <option value="">{emptyLabel}</option>
      {unresolved ? <option value={value}>ID {value} (not in this list)</option> : null}
      {options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
    </Select>
  );
}

function ColumnPicker<Key extends string>({
  definitions,
  defaults,
  locale,
  selected,
  onChange,
}: {
  definitions: readonly ColumnDefinition<Key>[];
  defaults: readonly Key[];
  locale: "en" | "nl";
  selected: Key[];
  onChange: (columns: Key[]) => void;
}) {
  function toggle(key: Key, checked: boolean) {
    const keys = new Set(selected);
    if (checked) keys.add(key);
    else keys.delete(key);
    onChange(definitions.map(({ key: column }) => column).filter((column) => keys.has(column)));
  }

  return (
    <details className="column-picker">
      <summary><span>Columns</span><small>{selected.length || "Default"} selected</small></summary>
      <div className="column-actions">
        <button type="button" onClick={() => onChange(definitions.map(({ key }) => key))}>All</button>
        <button type="button" onClick={() => onChange([...defaults])}>Default</button>
        <button type="button" onClick={() => onChange([])}>None</button>
      </div>
      <div className="columns-grid">
        {definitions.map((definition) => (
          <label key={definition.key}>
            <input
              type="checkbox"
              checked={selected.includes(definition.key)}
              onChange={(event) => toggle(definition.key, event.target.checked)}
            />
            <span>{definition.label[locale]} <code>{definition.key}</code></span>
          </label>
        ))}
      </div>
      <p>When none are selected, the widget uses Jaap&apos;s default column set.</p>
    </details>
  );
}

export function App() {
  const publicBase = (import.meta.env.VITE_NBB_PUBLIC_URL as string | undefined)?.replace(/\/$/, "") || window.location.origin;
  const apiUrl = `${publicBase}/api/nbb-stats`;
  const optionsUrl = `${publicBase}/api/nbb-options`;
  const scriptUrl = (import.meta.env.VITE_NBB_WIDGET_SCRIPT_URL as string | undefined)
    || (publicBase === window.location.origin
      ? `${publicBase}/nbb-stats-widget.js`
      : NBB_STATS_WIDGET_SCRIPT_URL);

  const [kind, setKind] = useState<"games" | "standings">("games");
  const [selectionMode, setSelectionMode] = useState<"guided" | "manual">("manual");
  const [clubId, setClubId] = useState("");
  const [season, setSeason] = useState(JAAP_DEFAULT_SEASON);
  const [teamId, setTeamId] = useState("");
  const [competitionId, setCompetitionId] = useState(JAAP_DEFAULT_COMPETITION);
  const [locationId, setLocationId] = useState("");
  const [highlightClubId, setHighlightClubId] = useState("");

  const [view, setView] = useState<GamesWidgetConfig["view"]>("all");
  const [venue, setVenue] = useState<GamesWidgetConfig["venue"]>("all");
  const [limit, setLimit] = useState("");
  const [layout, setLayout] = useState<GamesWidgetConfig["layout"]>("table");
  const [gameColumns, setGameColumns] = useState<GameColumnKey[]>(defaultGameColumns);
  const [groupByWeek, setGroupByWeek] = useState(false);
  const [gameSorting, setGameSorting] = useState(true);
  const [gameTableClass, setGameTableClass] = useState("wedstrijd-table");
  const [gameEvenRow, setGameEvenRow] = useState("#ffffff");
  const [gameOddRow, setGameOddRow] = useState("#f2f4f7");

  const [standingsLayout, setStandingsLayout] = useState<StandingsWidgetConfig["layout"]>("table");
  const [records, setRecords] = useState(false);
  const [standingsColumns, setStandingsColumns] = useState<StandingsColumnKey[]>(defaultStandingsColumns);
  const [standingsSorting, setStandingsSorting] = useState(true);
  const [standingsTableClass, setStandingsTableClass] = useState("stand-table");
  const [standingsEvenRow, setStandingsEvenRow] = useState("#ffffff");
  const [standingsOddRow, setStandingsOddRow] = useState("#f2f4f7");
  const [highlightColor, setHighlightColor] = useState("#fff3cd");
  const [showMeta, setShowMeta] = useState(false);

  const [theme, setTheme] = useState<WidgetConfig["theme"]>("light");
  const [locale, setLocale] = useState<WidgetConfig["locale"]>("nl");
  const [accent, setAccent] = useState("#ef4b23");
  const [clubs, setClubs] = useState<NamedOption[]>([]);
  const [clubOptions, setClubOptions] = useState<ClubOptionsResponse["data"]>({ competitions: [], locations: [], teams: [] });
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [optionsError, setOptionsError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (selectionMode !== "guided" || clubs.length) return;
    const controller = new AbortController();
    setOptionsLoading(true);
    setOptionsError("");
    fetch(`${optionsUrl}?resource=clubs&schema=2`, { headers: { Accept: "application/json" }, signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Could not load clubs (${response.status})`);
        return response.json() as Promise<ClubsOptionsResponse>;
      })
      .then((response) => setClubs(response.data))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setOptionsError(error instanceof Error ? error.message : "Could not load clubs");
      })
      .finally(() => { if (!controller.signal.aborted) setOptionsLoading(false); });
    return () => controller.abort();
  }, [clubs.length, optionsUrl, selectionMode]);

  useEffect(() => {
    const selectedClub = positiveOrUndefined(clubId);
    if (selectionMode !== "guided" || !selectedClub || !/^\d{4}-\d{4}$/.test(season)) {
      setClubOptions({ competitions: [], locations: [], teams: [] });
      return;
    }
    const controller = new AbortController();
    setOptionsLoading(true);
    setOptionsError("");
    const parameters = new URLSearchParams({ resource: "club", clubId: String(selectedClub), season, schema: "2" });
    fetch(`${optionsUrl}?${parameters}`, { headers: { Accept: "application/json" }, signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Could not load club choices (${response.status})`);
        return response.json() as Promise<ClubOptionsResponse>;
      })
      .then((response) => setClubOptions(response.data))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setOptionsError(error instanceof Error ? error.message : "Could not load club choices");
      })
      .finally(() => { if (!controller.signal.aborted) setOptionsLoading(false); });
    return () => controller.abort();
  }, [clubId, optionsUrl, season, selectionMode]);

  const resolvedSeason = /^\d{4}-\d{4}$/.test(season) ? season : undefined;
  const config = useMemo<WidgetConfig | undefined>(() => {
    if (!resolvedSeason) return undefined;
    const club = positiveOrUndefined(clubId);
    const competition = positiveOrUndefined(competitionId);
    const common = { clubId: club, season: resolvedSeason, locale, theme, accent };
    if (kind === "games") {
      const team = positiveOrUndefined(teamId);
      const location = positiveOrUndefined(locationId);
      if (!club && !competition && !team && !location) return undefined;
      if (!club && venue !== "all") return undefined;
      return {
        kind,
        ...common,
        columns: gameColumns,
        competitionId: competition,
        enableSorting: gameSorting,
        evenRowColor: gameEvenRow,
        groupByWeek,
        layout,
        limit: positiveOrUndefined(limit),
        locationId: location,
        oddRowColor: gameOddRow,
        tableClass: gameTableClass || "wedstrijd-table",
        teamId: team,
        venue,
        view,
      };
    }
    if (!competition) return undefined;
    return {
      kind,
      ...common,
      columns: standingsColumns,
      competitionId: competition,
      enableSorting: standingsSorting,
      evenRowColor: standingsEvenRow,
      highlightClubId: positiveOrUndefined(highlightClubId),
      highlightColor,
      layout: standingsLayout,
      oddRowColor: standingsOddRow,
      records,
      showMeta,
      tableClass: standingsTableClass || "stand-table",
    };
  }, [
    accent, clubId, competitionId, gameColumns, gameEvenRow, gameOddRow, gameSorting,
    gameTableClass, groupByWeek, highlightClubId, highlightColor, kind, layout, limit,
    locale, locationId, records, resolvedSeason, standingsColumns, standingsEvenRow,
    standingsLayout, standingsOddRow, standingsSorting, standingsTableClass, showMeta,
    teamId, theme, venue, view,
  ]);

  const previewConfig = useDebouncedValue(config ? { ...config, apiUrl } : undefined, 250);
  const snippet = useMemo(() => {
    if (!config) return "Complete the required fields to generate the embed code.";
    try { return generateSnippet(config, scriptUrl); }
    catch (error) { return error instanceof Error ? error.message : "Invalid configuration"; }
  }, [config, scriptUrl]);

  async function copyCode() {
    if (!config) return;
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  function changeGuidedClub(value: string) {
    setClubId(value);
    setTeamId("");
    setLocationId("");
    setCompetitionId("");
  }

  function changeGuidedSeason(value: string) {
    setSeason(value);
    setTeamId("");
    setLocationId("");
    setCompetitionId("");
  }

  const dataFields = selectionMode === "guided" ? (
    <>
      <Field label="Club" hint="Names are loaded through the cached NBB-Stats backend">
        <NamedSelect value={clubId} options={clubs} emptyLabel={optionsLoading && !clubs.length ? "Loading clubs…" : "Choose a club"} onChange={changeGuidedClub} disabled={optionsLoading && !clubs.length} />
      </Field>
      <Field label="Season">
        <Select value={season} onChange={changeGuidedSeason}>{availableSeasons().map((value) => <option key={value}>{value}</option>)}</Select>
      </Field>
      <Field label="Competition" hint={kind === "standings" ? "Required" : "Optional filter"}>
        <NamedSelect value={competitionId} options={clubOptions.competitions} emptyLabel={positiveOrUndefined(clubId) ? "All competitions" : "Choose a club first"} onChange={setCompetitionId} disabled={!positiveOrUndefined(clubId) || optionsLoading} />
      </Field>
      {kind === "games" ? (
        <>
          <Field label="Team" hint="Optional filter">
            <NamedSelect value={teamId} options={clubOptions.teams} emptyLabel={positiveOrUndefined(clubId) ? "All club teams" : "Choose a club first"} onChange={setTeamId} disabled={!positiveOrUndefined(clubId) || optionsLoading} />
          </Field>
          <Field label="Location" hint="Optional filter">
            <NamedSelect value={locationId} options={clubOptions.locations} emptyLabel={positiveOrUndefined(clubId) ? "All locations" : "Choose a club first"} onChange={setLocationId} disabled={!positiveOrUndefined(clubId) || optionsLoading} />
          </Field>
        </>
      ) : null}
    </>
  ) : (
    <>
      {kind === "games" ? (
        <Field label="Club ID" hint="Optional; at least one ID filter is required">
          <input inputMode="numeric" value={clubId} onChange={(event) => setClubId(event.target.value)} placeholder="All clubs" />
        </Field>
      ) : null}
      <Field label="Season" hint="YYYY-YYYY">
        <input value={season} onChange={(event) => setSeason(event.target.value)} />
      </Field>
      <Field label="Competition ID" hint={kind === "standings" ? "Required" : "Optional filter"}>
        <input inputMode="numeric" value={competitionId} onChange={(event) => setCompetitionId(event.target.value)} placeholder={kind === "standings" ? "Required" : "All competitions"} />
      </Field>
      {kind === "games" ? (
        <>
          <Field label="Team ID" hint="Optional filter">
            <input inputMode="numeric" value={teamId} onChange={(event) => setTeamId(event.target.value)} placeholder="All teams" />
          </Field>
          <Field label="Location ID" hint="Optional filter">
            <input inputMode="numeric" value={locationId} onChange={(event) => setLocationId(event.target.value)} placeholder="All locations" />
          </Field>
        </>
      ) : null}
    </>
  );

  return (
    <main>
      <header className="hero">
        <nav>
          <a className="brand" href="#top" aria-label="NBB Stats Generator home">
            <span className="brand-mark">N</span>
            <span>NBB Stats <b>Generator</b></span>
          </a>
          <a className="github-link" href="https://github.com/Hashim-K/NBB-Stats-Generator">View source <span aria-hidden="true">↗</span></a>
        </nav>
        <div className="hero-copy" id="top">
          <p className="eyebrow">Configure · preview · paste</p>
          <h1>Basketball data that is easy to embed—and considerate by default.</h1>
          <p className="lede">Build a games or standings widget without another server. The rendered preview updates live through NBB-Stats; exported widgets read Basketballstats directly, then retain each response in the visitor&apos;s browser until the next scheduled source refresh.</p>
          <div className="trust-row" aria-label="Traffic protections">
            <span><i className="dot dot-green" /> Cached NBB-Stats preview</span>
            <span><i className="dot dot-orange" /> 15-second browser queue</span>
            <span><i className="dot dot-blue" /> Crawler loading blocked</span>
          </div>
        </div>
      </header>

      <section className="workspace" aria-label="Widget configurator">
        <aside className="controls-card">
          <div className="section-heading">
            <div><span>01</span><h2>Choose a widget</h2></div>
            <p>Preview updates automatically.</p>
          </div>
          <div className="segmented">
            <button className={kind === "games" ? "active" : ""} onClick={() => setKind("games")}>Games</button>
            <button className={kind === "standings" ? "active" : ""} onClick={() => setKind("standings")}>Standings</button>
          </div>

          <div className="form-section">
            <div className="form-title-row">
              <h3>Data source</h3>
              <div className="mini-segmented" aria-label="Data selection mode">
                <button type="button" className={selectionMode === "manual" ? "active" : ""} onClick={() => setSelectionMode("manual")}>IDs</button>
                <button type="button" className={selectionMode === "guided" ? "active" : ""} onClick={() => setSelectionMode("guided")}>Names</button>
              </div>
            </div>
            <div className="field-grid">{dataFields}</div>
            {optionsError ? <p className="form-error">{optionsError}. You can switch to IDs while cached choices become available.</p> : null}
            {selectionMode === "manual" ? <p className="form-note">The page origin is detected automatically in the generated widget, so it cannot be mistyped.</p> : null}
          </div>

          {kind === "games" ? (
            <div className="form-section">
              <h3>Games</h3>
              <div className="field-grid">
                <Field label="Show">
                  <Select value={view} onChange={(value) => setView(value as GamesWidgetConfig["view"])}>
                    <option value="all">All games</option><option value="upcoming">Upcoming</option><option value="results">Results</option>
                  </Select>
                </Field>
                <Field label="Venue">
                  <Select value={venue} onChange={(value) => setVenue(value as GamesWidgetConfig["venue"])}>
                    <option value="all">Home and away</option><option value="home">Home only</option><option value="away">Away only</option>
                  </Select>
                </Field>
                <Field label="Layout">
                  <Select value={layout} onChange={(value) => setLayout(value as GamesWidgetConfig["layout"])}>
                    <option value="table">Table</option><option value="cards">Cards</option>
                  </Select>
                </Field>
                <Field label="Maximum games" hint="Blank shows all matches">
                  <input inputMode="numeric" value={limit} onChange={(event) => setLimit(event.target.value)} placeholder="All" />
                </Field>
                <Toggle checked={groupByWeek} label="Group by week" onChange={setGroupByWeek} />
                <Toggle checked={gameSorting} label="Sortable columns" onChange={setGameSorting} />
              </div>
              <ColumnPicker definitions={gameColumnDefinitions} defaults={defaultGameColumns} locale={locale} selected={gameColumns} onChange={setGameColumns} />
            </div>
          ) : (
            <div className="form-section">
              <h3>Standings</h3>
              <div className="field-grid">
                <Field label="Layout">
                  <Select value={standingsLayout} onChange={(value) => setStandingsLayout(value as StandingsWidgetConfig["layout"])}>
                    <option value="table">Table</option><option value="combined">Table + points bars</option><option value="bars">Points bars</option>
                  </Select>
                </Field>
                <Field label="Highlight club ID" hint="Optional; marks your club">
                  {selectionMode === "guided"
                    ? <NamedSelect value={highlightClubId} options={clubs} emptyLabel="No highlighted club" onChange={setHighlightClubId} />
                    : <input inputMode="numeric" value={highlightClubId} onChange={(event) => setHighlightClubId(event.target.value)} placeholder="None" />}
                </Field>
                <Toggle checked={standingsSorting} label="Sortable columns" onChange={setStandingsSorting} />
                <Toggle checked={showMeta} label="Show information row" hint="Competition, season and team count" onChange={setShowMeta} />
                <Toggle checked={records} label="Calculate W-L-D" hint="Uses cached competition games; an NBB-Stats extension" onChange={setRecords} />
              </div>
              <ColumnPicker definitions={standingsColumnDefinitions} defaults={defaultStandingsColumns} locale={locale} selected={standingsColumns} onChange={setStandingsColumns} />
            </div>
          )}

          <div className="form-section">
            <h3>Table appearance</h3>
            <div className="field-grid">
              <Field label="Table class">
                <input value={kind === "games" ? gameTableClass : standingsTableClass} onChange={(event) => kind === "games" ? setGameTableClass(event.target.value) : setStandingsTableClass(event.target.value)} />
              </Field>
              <Field label="Even row colour">
                <span className="color-input"><input type="color" value={kind === "games" ? gameEvenRow : standingsEvenRow} onChange={(event) => kind === "games" ? setGameEvenRow(event.target.value) : setStandingsEvenRow(event.target.value)} /><code>{kind === "games" ? gameEvenRow : standingsEvenRow}</code></span>
              </Field>
              <Field label="Odd row colour">
                <span className="color-input"><input type="color" value={kind === "games" ? gameOddRow : standingsOddRow} onChange={(event) => kind === "games" ? setGameOddRow(event.target.value) : setStandingsOddRow(event.target.value)} /><code>{kind === "games" ? gameOddRow : standingsOddRow}</code></span>
              </Field>
              {kind === "standings" ? (
                <Field label="Highlight colour">
                  <span className="color-input"><input type="color" value={highlightColor} onChange={(event) => setHighlightColor(event.target.value)} /><code>{highlightColor}</code></span>
                </Field>
              ) : null}
            </div>
          </div>

          <div className="form-section">
            <h3>Widget appearance</h3>
            <div className="field-grid">
              <Field label="Language"><Select value={locale} onChange={(value) => setLocale(value as WidgetConfig["locale"])}><option value="nl">Nederlands</option><option value="en">English</option></Select></Field>
              <Field label="Theme"><Select value={theme} onChange={(value) => setTheme(value as WidgetConfig["theme"])}><option value="light">Light</option><option value="auto">Match website</option><option value="dark">Dark</option></Select></Field>
              <Field label="Accent colour">
                <span className="color-input"><input type="color" value={accent} onChange={(event) => setAccent(event.target.value)} /><code>{accent}</code></span>
              </Field>
            </div>
          </div>
        </aside>

        <div className="preview-column">
          <section className="preview-card">
            <div className="browser-bar"><span className="traffic-lights"><i /><i /><i /></span><span>Rendered widget preview</span><span className="secure-pill">live · cached</span></div>
            <div className="preview-stage" data-theme={theme}>
              <WidgetPreview config={previewConfig} />
            </div>
          </section>

          <section className="code-card">
            <div className="code-heading"><div><span>02</span><h2>Copy and paste</h2></div><button onClick={() => void copyCode()} disabled={!config}>{copied ? "Copied" : "Copy code"}</button></div>
            <pre><code>{snippet}</code></pre>
            <p className="code-note">Paste this into an HTML/Code block in WordPress, Squarespace, or another website builder. The widget script is served by NBB Stats Generator; only its rate-limited JSON data requests go to Basketballstats.</p>
          </section>
        </div>
      </section>

      <section className="safety-section">
        <div className="safety-copy"><p className="eyebrow">Defence in depth</p><h2>The preview and exported widget have different data paths.</h2><p>The preview uses the persistent NBB-Stats cache. Exported code stores Basketballstats responses locally, coalesces matching calls, and serialises direct source requests from that browser at least 15 seconds apart—even across tabs when Web Locks are available.</p></div>
        <div className="safety-grid">
          <article><span>1</span><h3>Local first</h3><p>Fresh localStorage data renders without a network request. Stale data remains visible during a background refresh.</p></article>
          <article><span>2</span><h3>One browser queue</h3><p>Games and standings share one Basketballstats timestamp, so changing endpoint cannot bypass the 15-second interval.</p></article>
          <article><span>3</span><h3>Scheduled freshness</h3><p>Current-season data stays fresh until the next Basketballstats import window. Historical seasons are retained permanently.</p></article>
          <article><span>4</span><h3>Honest bot boundary</h3><p>The widget refuses known crawlers and non-browser execution. This reduces accidental traffic, but client-side checks are deterrence—not authentication.</p></article>
        </div>
      </section>

      <footer><span>NBB Stats Generator</span><p>Independent open-source tooling. Not an official Basketball Nederland or Basketballstats product.</p></footer>
    </main>
  );
}
