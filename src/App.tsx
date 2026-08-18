import { useEffect, useMemo, useRef, useState } from "react";

import {
  NBB_STATS_WIDGET_SCRIPT_URL,
  generateSnippet,
} from "./generator/snippet";
import type { GamesWidgetConfig, StandingsWidgetConfig, WidgetConfig } from "./widget/types";

function inferredSeason() {
  const now = new Date();
  const start = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  return `${start}-${start + 1}`;
}

function positiveOrUndefined(value: string) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function attr(name: string, value: string | number | boolean | undefined) {
  if (value === undefined || value === false || value === "") return undefined;
  return value === true ? [name, ""] as const : [name, String(value)] as const;
}

function WidgetPreview({ config, generation }: { config?: WidgetConfig; generation: number }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!host.current || !config) return;
    const element = document.createElement(config.kind === "games" ? "nbb-games" : "nbb-standings");
    const common = [
      attr("api-url", config.apiUrl), attr("club-id", config.clubId), attr("season", config.season),
      attr("locale", config.locale), attr("theme", config.theme), attr("accent", config.accent),
    ];
    const specific = config.kind === "games"
      ? [
          attr("team-id", config.teamId), attr("competition-id", config.competitionId),
          attr("layout", config.layout), attr("limit", config.limit), attr("venue", config.venue), attr("view", config.view),
        ]
      : [
          attr("competition-id", config.competitionId), attr("highlight-club-id", config.highlightClubId),
          attr("layout", config.layout), attr("records", config.records),
        ];
    [...common, ...specific].filter((entry): entry is readonly [string, string] => Boolean(entry)).forEach(([name, value]) => element.setAttribute(name, value));
    host.current.replaceChildren(element);
    return () => element.remove();
  }, [config, generation]);

  if (!config) {
    return (
      <div className="preview-empty">
        <span className="preview-ball" aria-hidden="true" />
        <strong>Preview waits for you</strong>
        <p>Choose the data first, then explicitly load it. Editing colours and layouts never creates an upstream request.</p>
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

function Select({ value, onChange, children }: { value: string; onChange: (value: string) => void; children: React.ReactNode }) {
  return <select value={value} onChange={(event) => onChange(event.target.value)}>{children}</select>;
}

export function App() {
  const publicBase = (import.meta.env.VITE_NBB_PUBLIC_URL as string | undefined)?.replace(/\/$/, "") || window.location.origin;
  const apiUrl = `${publicBase}/api/nbb-stats`;
  const scriptUrl = (import.meta.env.VITE_NBB_WIDGET_SCRIPT_URL as string | undefined)
    || (publicBase === window.location.origin
      ? `${publicBase}/nbb-stats-widget.js`
      : NBB_STATS_WIDGET_SCRIPT_URL);
  const [kind, setKind] = useState<"games" | "standings">("games");
  const [clubId, setClubId] = useState("57");
  const [season, setSeason] = useState(inferredSeason());
  const [teamId, setTeamId] = useState("");
  const [competitionId, setCompetitionId] = useState("");
  const [view, setView] = useState<GamesWidgetConfig["view"]>("upcoming");
  const [venue, setVenue] = useState<GamesWidgetConfig["venue"]>("all");
  const [limit, setLimit] = useState("7");
  const [layout, setLayout] = useState<GamesWidgetConfig["layout"]>("cards");
  const [standingsLayout, setStandingsLayout] = useState<StandingsWidgetConfig["layout"]>("combined");
  const [records, setRecords] = useState(true);
  const [theme, setTheme] = useState<WidgetConfig["theme"]>("auto");
  const [locale, setLocale] = useState<WidgetConfig["locale"]>("nl");
  const [accent, setAccent] = useState("#ef4b23");
  const [preview, setPreview] = useState<WidgetConfig>();
  const [previewGeneration, setPreviewGeneration] = useState(0);
  const [copied, setCopied] = useState(false);

  const config = useMemo<WidgetConfig | undefined>(() => {
    const club = positiveOrUndefined(clubId);
    const competition = positiveOrUndefined(competitionId);
    if (!club || !/^\d{4}-\d{4}$/.test(season)) return undefined;
    const common = { clubId: club, season, locale, theme, accent };
    if (kind === "games") {
      return {
        kind,
        ...common,
        teamId: positiveOrUndefined(teamId),
        competitionId: competition,
        layout,
        limit: positiveOrUndefined(limit) ?? 7,
        venue,
        view,
      };
    }
    if (!competition) return undefined;
    return {
      kind,
      ...common,
      competitionId: competition,
      highlightClubId: club,
      layout: standingsLayout,
      records,
    };
  }, [accent, clubId, competitionId, kind, layout, limit, locale, records, season, standingsLayout, teamId, theme, venue, view]);

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

  function loadPreview() {
    if (!config) return;
    setPreview({ ...config, apiUrl });
    setPreviewGeneration((value) => value + 1);
  }

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
          <p className="lede">Build a games or standings widget without another server. The preview uses NBB-Stats; exported widgets read Basketballstats directly, then retain each response in the visitor's browser until the next scheduled source refresh.</p>
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
            <p>The preview only loads when you ask it to.</p>
          </div>
          <div className="segmented">
            <button className={kind === "games" ? "active" : ""} onClick={() => setKind("games")}>Games</button>
            <button className={kind === "standings" ? "active" : ""} onClick={() => setKind("standings")}>Standings</button>
          </div>

          <div className="form-section">
            <h3>Data source</h3>
            <div className="field-grid">
              <Field label="Club ID" hint="Basketballstats database ID">
                <input inputMode="numeric" value={clubId} onChange={(event) => setClubId(event.target.value)} />
              </Field>
              <Field label="Season" hint="YYYY-YYYY">
                <input value={season} onChange={(event) => setSeason(event.target.value)} />
              </Field>
              <Field label="Competition ID" hint={kind === "standings" ? "Required" : "Optional filter"}>
                <input inputMode="numeric" value={competitionId} onChange={(event) => setCompetitionId(event.target.value)} placeholder={kind === "standings" ? "Required" : "All competitions"} />
              </Field>
              {kind === "games" ? (
                <Field label="Team ID" hint="Optional filter">
                  <input inputMode="numeric" value={teamId} onChange={(event) => setTeamId(event.target.value)} placeholder="All club teams" />
                </Field>
              ) : null}
            </div>
          </div>

          {kind === "games" ? (
            <div className="form-section">
              <h3>Games</h3>
              <div className="field-grid">
                <Field label="Show">
                  <Select value={view} onChange={(value) => setView(value as GamesWidgetConfig["view"])}>
                    <option value="upcoming">Upcoming</option><option value="results">Results</option><option value="all">All games</option>
                  </Select>
                </Field>
                <Field label="Venue">
                  <Select value={venue} onChange={(value) => setVenue(value as GamesWidgetConfig["venue"])}>
                    <option value="all">Home and away</option><option value="home">Home only</option><option value="away">Away only</option>
                  </Select>
                </Field>
                <Field label="Layout">
                  <Select value={layout} onChange={(value) => setLayout(value as GamesWidgetConfig["layout"])}>
                    <option value="cards">Cards</option><option value="table">Table</option>
                  </Select>
                </Field>
                <Field label="Maximum games">
                  <input inputMode="numeric" value={limit} onChange={(event) => setLimit(event.target.value)} />
                </Field>
              </div>
            </div>
          ) : (
            <div className="form-section">
              <h3>Standings</h3>
              <div className="field-grid">
                <Field label="Layout">
                  <Select value={standingsLayout} onChange={(value) => setStandingsLayout(value as StandingsWidgetConfig["layout"])}>
                    <option value="combined">Table + points bars</option><option value="table">Table</option><option value="bars">Points bars</option>
                  </Select>
                </Field>
                <label className="toggle-field">
                  <span><strong>Calculate W-L-D</strong><small>Uses cached competition games</small></span>
                  <input type="checkbox" checked={records} onChange={(event) => setRecords(event.target.checked)} />
                </label>
              </div>
            </div>
          )}

          <div className="form-section">
            <h3>Appearance</h3>
            <div className="field-grid">
              <Field label="Language"><Select value={locale} onChange={(value) => setLocale(value as WidgetConfig["locale"])}><option value="nl">Nederlands</option><option value="en">English</option></Select></Field>
              <Field label="Theme"><Select value={theme} onChange={(value) => setTheme(value as WidgetConfig["theme"])}><option value="auto">Match website</option><option value="light">Light</option><option value="dark">Dark</option></Select></Field>
              <Field label="Accent colour">
                <span className="color-input"><input type="color" value={accent} onChange={(event) => setAccent(event.target.value)} /><code>{accent}</code></span>
              </Field>
            </div>
          </div>

          <button className="primary-button" disabled={!config} onClick={loadPreview}>Load live preview <span aria-hidden="true">→</span></button>
        </aside>

        <div className="preview-column">
          <section className="preview-card">
            <div className="browser-bar"><span className="traffic-lights"><i /><i /><i /></span><span>Live widget preview</span><span className="secure-pill">cached</span></div>
            <div className="preview-stage" data-theme={theme}>
              <WidgetPreview config={preview} generation={previewGeneration} />
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
