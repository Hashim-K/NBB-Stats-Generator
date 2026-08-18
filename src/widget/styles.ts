export const widgetStyles = `
:host {
  --nbb-accent: #ef4b23;
  display: block;
  color: #162023;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
* { box-sizing: border-box; }
.root {
  --surface: #fff;
  --surface-2: #f3f5f4;
  --line: #dce1df;
  --text: #162023;
  --muted: #66716e;
  color: var(--text);
}
.root.theme-dark {
  --surface: #111718;
  --surface-2: #192123;
  --line: #2e393a;
  --text: #f5f7f6;
  --muted: #a5afac;
}
@media (prefers-color-scheme: dark) {
  .root.theme-auto {
    --surface: #111718;
    --surface-2: #192123;
    --line: #2e393a;
    --text: #f5f7f6;
    --muted: #a5afac;
  }
}
.status { min-height: 1.2rem; margin: 0 0 .65rem; color: var(--muted); font-size: .78rem; }
.notice { border: 1px solid var(--line); border-radius: 14px; background: var(--surface); padding: 1rem; }
.games { display: grid; gap: .75rem; }
.game { border: 1px solid var(--line); border-radius: 16px; overflow: hidden; background: var(--surface); box-shadow: 0 10px 28px rgba(0,0,0,.06); }
.game__meta, .game__venue { display: flex; justify-content: space-between; gap: 1rem; padding: .65rem .85rem; color: var(--muted); font-size: .78rem; }
.game__meta { border-bottom: 1px solid var(--line); text-transform: uppercase; letter-spacing: .06em; }
.game__venue { border-top: 1px solid var(--line); }
.matchup { display: grid; grid-template-columns: minmax(0,1fr) auto minmax(0,1fr); gap: .8rem; align-items: center; padding: 1rem .85rem; }
.team { display: flex; gap: .55rem; align-items: center; min-width: 0; }
.team--away { justify-content: flex-end; text-align: right; }
.team__name { overflow: hidden; text-overflow: ellipsis; }
.mark { display: grid; place-items: center; width: 2rem; height: 2rem; flex: 0 0 auto; border-radius: 50%; background: color-mix(in srgb, var(--nbb-accent) 15%, var(--surface-2)); color: var(--nbb-accent); font-size: .7rem; font-weight: 800; }
.score { display: grid; justify-items: center; min-width: 4.6rem; }
.score strong { font-size: 1.15rem; font-variant-numeric: tabular-nums; }
.score small { color: var(--muted); font-size: .66rem; letter-spacing: .08em; text-transform: uppercase; }
.table-wrap { overflow-x: auto; border: 1px solid var(--line); border-radius: 16px; background: var(--surface); }
table { width: 100%; border-collapse: collapse; font-size: .86rem; }
th, td { padding: .72rem .78rem; border-bottom: 1px solid var(--line); text-align: left; white-space: nowrap; }
th { color: var(--muted); background: var(--surface-2); font-size: .7rem; letter-spacing: .05em; text-transform: uppercase; }
tr:last-child td { border-bottom: 0; }
tr.highlight td { background: color-mix(in srgb, var(--nbb-accent) 10%, var(--surface)); }
.number { text-align: right; font-variant-numeric: tabular-nums; }
.standing-team { display: flex; align-items: center; gap: .55rem; }
.standing-team .mark { width: 1.65rem; height: 1.65rem; }
.bars { display: grid; gap: .8rem; padding: 1rem; border: 1px solid var(--line); border-radius: 16px; background: var(--surface); }
.bar__label { display: flex; justify-content: space-between; gap: 1rem; margin-bottom: .35rem; font-size: .84rem; }
.bar__track { display: block; height: .5rem; overflow: hidden; border-radius: 99px; background: var(--surface-2); }
.bar__value { display: block; height: 100%; border-radius: inherit; background: #9aa4a1; }
.bar.highlight .bar__label { color: var(--nbb-accent); }
.bar.highlight .bar__value { background: var(--nbb-accent); }
.combined { display: grid; gap: 1rem; }
@media (min-width: 850px) { .combined { grid-template-columns: minmax(0,1.35fr) minmax(260px,.65fr); align-items: start; } }
@media (max-width: 620px) {
  .matchup { gap: .45rem; padding-inline: .65rem; }
  .team { flex-direction: column; align-items: flex-start; font-size: .82rem; }
  .team--away { align-items: flex-end; }
  .score { min-width: 3.5rem; }
}
`;
