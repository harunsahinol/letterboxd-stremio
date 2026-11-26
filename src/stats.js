// Anonymous usage statistics: what gets counted, and the public /stats page.
//
// Privacy rules (also stated on the page and in the README):
//  - Only daily totals are kept. No usernames, list names, IPs or user agents.
//  - An install is recognised within one day by a keyed hash of its config
//    that changes every day, so installs can't be followed from day to day.
//  - Per-day hashes are deleted when the day is rolled up into totals.
//  - Counting only runs where the host turns it on (see netlify/stats-store.js);
//    self-hosted copies count nothing by default.

import { LANGS } from "./i18n.js";

export const FEATURES = { d: "diary", l: "lists", h: "hide", m: "me" };

// The only facts ever recorded about an install: its language and which
// features are switched on, plus the country the request came from (as the
// host reports it; never the IP). Encoded as a short tag, e.g. "en.dlm.TR".
export function installTag(cfg, country) {
  const lang = LANGS[cfg.lang] ? cfg.lang : "en";
  const flags =
    (cfg.diary ? "d" : "") +
    (cfg.lists && cfg.lists.length ? "l" : "") +
    (cfg.me && cfg.hideWatched ? "h" : "") +
    (cfg.me ? "m" : "");
  const cc = /^[A-Z]{2}$/.test(country || "") ? country : "XX";
  return `${lang}.${flags || "-"}.${cc}`;
}

// Turns the tags seen on one day into that day's totals.
export function summarizeDay(day, tags, views) {
  const out = { day, installs: tags.length, views, langs: {}, countries: {}, features: { diary: 0, lists: 0, hide: 0, me: 0 } };
  for (const tag of tags) {
    const [lang, flags = "", cc] = tag.split(".");
    out.langs[lang] = (out.langs[lang] || 0) + 1;
    if (cc) out.countries[cc] = (out.countries[cc] || 0) + 1;
    for (const f of flags) if (FEATURES[f]) out.features[FEATURES[f]]++;
  }
  return out;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const nf = new Intl.NumberFormat("en");
const fmtDay = (d) =>
  new Date(d + "T00:00:00Z").toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "UTC" });

// days: ascending list of summarizeDay() results; the last one may be today (partial).
export function statsPage(days, today) {
  const full = days.filter((d) => d.day !== today);
  const todayRow = days.find((d) => d.day === today);
  const last7 = full.slice(-7);
  const avg7 = last7.length ? Math.round(last7.reduce((a, d) => a + d.installs, 0) / last7.length) : null;
  const peak = full.reduce((p, d) => (!p || d.installs > p.installs ? d : p), null);
  const yesterday = full[full.length - 1];

  // Language and feature shares over the last 7 full days (today if none yet).
  const win = last7.length ? last7 : todayRow ? [todayRow] : [];
  const winTotal = win.reduce((a, d) => a + d.installs, 0);
  const sum = (pick) => {
    const acc = {};
    for (const d of win) for (const [k, v] of Object.entries(pick(d))) acc[k] = (acc[k] || 0) + v;
    return acc;
  };
  const langs = Object.entries(sum((d) => d.langs)).sort((a, b) => b[1] - a[1]);
  const allCountries = Object.entries(sum((d) => d.countries || {})).sort((a, b) => b[1] - a[1]);
  const known = allCountries.filter(([k]) => k !== "XX");
  const countries = known.slice(0, 10);
  const otherCountries = winTotal - countries.reduce((a, [, n]) => a + n, 0);
  let regionName;
  try {
    const dn = new Intl.DisplayNames(["en"], { type: "region" });
    regionName = (cc) => dn.of(cc) || cc;
  } catch {
    regionName = (cc) => cc;
  }
  const flag = (cc) => String.fromCodePoint(...[...cc].map((c) => 0x1f1a5 + c.charCodeAt(0)));
  const feats = sum((d) => d.features);
  const pct = (n) => (winTotal ? Math.round((n / winTotal) * 100) : 0);

  const tile = (label, value, note) =>
    `<div class="tile"><div class="tl">${label}</div><div class="tv">${value == null ? "–" : nf.format(value)}</div>${
      note ? `<div class="tn">${note}</div>` : ""
    }</div>`;

  // Bar chart of daily installs (last 90 days, oldest left).
  const series = days.slice(-90);
  const W = 720, H = 220, padL = 36, padB = 24, padT = 8;
  const max = Math.max(4, ...series.map((d) => d.installs));
  const step = niceStep(max);
  const top = Math.ceil(max / step) * step;
  const plotW = W - padL, plotH = H - padB - padT;
  const slot = series.length ? plotW / series.length : plotW;
  const bw = Math.max(2, Math.min(28, slot - 2));
  const y = (v) => padT + plotH - (v / top) * plotH;
  let grid = "";
  for (let v = 0; v <= top; v += step)
    grid += `<line x1="${padL}" x2="${W}" y1="${y(v)}" y2="${y(v)}" class="gl"/><text x="${padL - 6}" y="${y(v) + 4}" class="ax" text-anchor="end">${v}</text>`;
  const bars = series
    .map((d, i) => {
      const x = padL + i * slot + (slot - bw) / 2;
      const h = Math.max(d.installs ? 2 : 0, (d.installs / top) * plotH);
      const r = Math.min(4, bw / 2, h);
      const by = padT + plotH - h;
      const path = h
        ? `M${x},${padT + plotH}V${by + r}Q${x},${by} ${x + r},${by}H${x + bw - r}Q${x + bw},${by} ${x + bw},${by + r}V${padT + plotH}Z`
        : "";
      const tip = `${fmtDay(d.day)}${d.day === today ? " (so far)" : ""}: ${nf.format(d.installs)} installs, ${nf.format(d.views)} page visits`;
      return `<g class="bar${d.day === today ? " partial" : ""}" data-tip="${esc(tip)}"><rect x="${padL + i * slot}" y="${padT}" width="${slot}" height="${plotH}" class="hit"/>${
        path ? `<path d="${path}"/>` : ""
      }</g>`;
    })
    .join("");
  const labelEvery = Math.max(1, Math.ceil(series.length / 6));
  const xlabels = series
    .map((d, i) =>
      i % labelEvery === 0 || (i === series.length - 1 && i % labelEvery >= labelEvery / 2)
        ? `<text x="${padL + i * slot + slot / 2}" y="${H - 6}" class="ax" text-anchor="middle">${fmtDay(d.day)}</text>`
        : ""
    )
    .join("");

  const meter = (label, n) =>
    `<div class="row"><span class="rl">${label}</span><span class="track"><i style="width:${pct(n)}%"></i></span><span class="rv">${pct(n)}%</span></div>`;

  const table = days
    .slice()
    .reverse()
    .map(
      (d) =>
        `<tr><td>${d.day}${d.day === today ? " <small>(so far)</small>" : ""}</td><td>${nf.format(d.installs)}</td><td>${nf.format(d.views)}</td></tr>`
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Usage stats · Letterboxd for Stremio</title>
<link rel="icon" href="https://raw.githubusercontent.com/harunsahinol/letterboxd-stremio/main/docs/logo.png">
<style>
  :root { --bg:#14181c; --card:#1c2228; --line:#2c3440; --text:#e1e8f0; --muted:#8a9bab; --green:#00e054; --grid:#262e37; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; }
  main { max-width:780px; margin:0 auto; padding:32px 16px 64px; }
  h1 { font-size:24px; margin:0 0 4px; } h2 { font-size:15px; margin:0 0 12px; }
  .sub { color:var(--muted); margin:0 0 24px; }
  a { color:var(--green); }
  .tiles { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:16px; }
  .tile, .card { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:14px 16px; }
  .tl { color:var(--muted); font-size:13px; } .tv { font-size:28px; font-weight:700; font-variant-numeric:tabular-nums; } .tn { color:var(--muted); font-size:12px; }
  .card { margin-bottom:16px; position:relative; }
  svg { width:100%; height:auto; display:block; overflow:visible; }
  .gl { stroke:var(--grid); stroke-width:1; } .ax { fill:var(--muted); font-size:11px; }
  .bar path { fill:var(--green); } .bar.partial path { fill:var(--green); opacity:.45; }
  .bar .hit { fill:transparent; } .bar:hover path { opacity:.8; } .bar:hover .hit { fill:rgba(255,255,255,.04); }
  #tip { position:absolute; pointer-events:none; background:#0d1013; border:1px solid var(--line); border-radius:8px; padding:6px 10px; font-size:13px; white-space:nowrap; display:none; transform:translate(-50%,-100%); }
  .two { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
  .row { display:grid; grid-template-columns:110px 1fr 44px; align-items:center; gap:10px; margin:8px 0; font-size:14px; }
  .rl { color:var(--text); } .rv { text-align:right; color:var(--muted); font-variant-numeric:tabular-nums; }
  .track { height:8px; background:var(--grid); border-radius:4px; overflow:hidden; } .track i { display:block; height:100%; background:var(--green); border-radius:4px; }
  .note { color:var(--muted); font-size:13px; margin:4px 0 0; }
  details { margin-top:8px; } summary { cursor:pointer; color:var(--muted); font-size:14px; }
  table { width:100%; border-collapse:collapse; margin-top:8px; font-size:14px; font-variant-numeric:tabular-nums; }
  td, th { text-align:left; padding:6px 4px; border-bottom:1px solid var(--line); } th { color:var(--muted); font-weight:500; }
  .empty { color:var(--muted); padding:24px 0; text-align:center; }
  .wide .row { grid-template-columns:200px 1fr 44px; }
  @media (max-width:640px) { .wide .row { grid-template-columns:150px 1fr 44px; } .tiles { grid-template-columns:repeat(2,1fr); } .two { grid-template-columns:1fr; } }
</style>
</head>
<body>
<main>
  <h1>Usage stats</h1>
  <p class="sub">How many Stremio installs of <a href="/configure">Letterboxd for Stremio</a> were active each day. Anonymous totals only. <a href="#how">How this is counted</a></p>

  <div class="tiles">
    ${tile("Today so far", todayRow ? todayRow.installs : 0)}
    ${tile("Yesterday", yesterday ? yesterday.installs : null)}
    ${tile("7-day average", avg7)}
    ${tile("Busiest day", peak ? peak.installs : null, peak ? fmtDay(peak.day) : "")}
  </div>

  <div class="card">
    <h2>Active installs per day</h2>
    ${
      series.length
        ? `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Bar chart of active installs per day">${grid}${bars}${xlabels}</svg><div id="tip"></div>
    <p class="note">The lighter bar is today, still counting. Times are UTC.</p>`
        : `<div class="empty">No data yet. Counting starts with the first request.</div>`
    }
    <details><summary>Show as table</summary><table><tr><th>Day</th><th>Active installs</th><th>Page visits</th></tr>${table}</table></details>
  </div>

  <div class="two">
    <div class="card">
      <h2>Languages</h2>
      ${langs.length ? langs.map(([k, n]) => meter(esc(LANGS[k] || k), n)).join("") : `<div class="empty">No data yet</div>`}
    </div>
    <div class="card">
      <h2>Features in use</h2>
      ${
        winTotal
          ? meter("Diaries", feats.diary) + meter("Lists", feats.lists) + meter("Own username", feats.me) + meter("Hide watched", feats.hide)
          : `<div class="empty">No data yet</div>`
      }
    </div>
  </div>
  <div class="card wide" style="margin-top:16px">
    <h2>Countries</h2>
    ${
      countries.length
        ? countries.map(([cc, n]) => meter(`${flag(cc)} ${esc(regionName(cc))}`, n)).join("") +
          (otherCountries > 0 ? meter(known.length > 10 ? "Other / unknown" : "Unknown", otherCountries) : "")
        : `<div class="empty">No data yet</div>`
    }
  </div>
  <p class="note">Languages, features and countries: share of installs ${last7.length > 1 ? `over the last ${last7.length} days` : last7.length ? "yesterday" : "today"}.</p>

  <div class="card" id="how" style="margin-top:16px">
    <h2>How this is counted</h2>
    <p class="note">An install is counted once per day when Stremio asks the addon for a catalog. To recognise the same install within a day, the addon keeps a keyed hash of its install link that changes every day, and deletes it when the day is added to the totals. Besides that, only the install's language, which features are on, and the country Netlify reports for the request are kept. No usernames, list names, IP addresses or devices are stored. Countries reflect where requests come from, so VPN users show up under their VPN's country. Page visits are a plain count of configure page loads.</p>
    <p class="note">Installs that weren't opened on a given day aren't counted, so the total number of installs is higher. The code is <a href="https://github.com/harunsahinol/letterboxd-stremio/blob/main/src/stats.js">open source</a>.</p>
  </div>
</main>
<script>
(() => {
  const tip = document.getElementById("tip"); if (!tip) return;
  const card = tip.parentElement;
  document.querySelectorAll(".bar").forEach((g) => {
    g.addEventListener("mousemove", (e) => {
      const r = card.getBoundingClientRect();
      tip.textContent = g.dataset.tip; tip.style.display = "block";
      const x = Math.min(Math.max(e.clientX - r.left, 90), r.width - 90);
      tip.style.left = x + "px"; tip.style.top = (e.clientY - r.top - 12) + "px";
    });
    g.addEventListener("mouseleave", () => (tip.style.display = "none"));
  });
})();
</script>
</body>
</html>`;
}

function niceStep(max) {
  const raw = max / 4;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const m of [1, 2, 5, 10]) if (m * p >= raw) return m * p;
  return 10 * p;
}
