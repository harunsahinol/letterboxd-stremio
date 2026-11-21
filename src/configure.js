// Configuration / install page in English, Turkish, Spanish, French and Mandarin.

import { LANGS, PAGE, ADDON } from "./i18n.js";

export function configurePage(origin, cfg) {
  const initial = JSON.stringify({
    users: cfg ? cfg.users.join(", ") : "",
    lists: cfg ? cfg.lists.map((l) => `https://letterboxd.com/${l.u}/list/${l.s}/`).join("\n") : "",
    me: cfg && cfg.me ? cfg.me : "",
    hideWatched: cfg ? cfg.hideWatched : false,
    detailRating: cfg ? cfg.detailRating : false,
    sort: cfg ? cfg.sort : "added",
    lang: cfg ? cfg.lang : null,
  }).replace(/</g, "\\u003c");
  const i18n = JSON.stringify({
    langs: LANGS,
    page: PAGE,
    sorts: Object.fromEntries(Object.entries(ADDON).map(([l, t]) => [l, t.sorts])),
  }).replace(/</g, "\\u003c");
  const langOptions = Object.entries(LANGS)
    .map(([k, v]) => `<option value="${k}">${v}</option>`)
    .join("");
  const sortOptions = Object.entries(ADDON.en.sorts)
    .map(([k, v]) => `<option value="${k}">${v}</option>`)
    .join("");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Letterboxd for Stremio</title>
<style>
  :root { --bg:#14181c; --card:#1c2228; --line:#2c3440; --text:#e1e8f0; --muted:#8a9bab;
          --green:#00e054; --orange:#ff8000; --blue:#40bcf4; }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100vh; background:var(--bg); color:var(--text);
         font:16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
         display:flex; align-items:center; justify-content:center; padding:24px 16px 96px; }
  main { width:100%; max-width:480px; background:var(--card); border:1px solid var(--line);
         border-radius:14px; padding:28px; }
  .dots { display:flex; gap:6px; margin-bottom:14px; }
  .dots i { width:14px; height:14px; border-radius:50%; display:block; }
  h1 { font-size:22px; margin:0 0 6px; }
  h2 { font-size:12px; letter-spacing:.08em; text-transform:uppercase; color:var(--muted);
       margin:26px 0 0; padding-top:18px; border-top:1px solid var(--line); }
  p.sub { color:var(--muted); margin:0 0 6px; font-size:14px; }
  label { display:block; font-size:13px; color:var(--muted); margin:14px 0 6px; }
  input:not([type=checkbox]), select, textarea { width:100%; padding:11px 12px; border-radius:8px;
         border:1px solid var(--line); background:#0f1317; color:var(--text); font:inherit; font-size:15px; }
  textarea { min-height:76px; resize:vertical; font-size:14px; }
  input:focus, select:focus, textarea:focus { outline:2px solid var(--blue); outline-offset:0; border-color:transparent; }
  .check { display:flex; gap:10px; align-items:flex-start; margin-top:14px; color:var(--text); font-size:14px; cursor:pointer; }
  .check input { width:18px; height:18px; margin:2px 0 0; accent-color:var(--green); flex:none; }
  .check.off { opacity:.45; pointer-events:none; }
  .hint { font-size:12px; color:var(--muted); margin-top:6px; }
  .check .hint { margin-top:2px; }
  .status { font-size:13px; margin-top:8px; }
  .status:empty { display:none; }
  .ok { color:var(--green); } .err { color:#ff6b6b; }
  .btns { display:grid; gap:10px; margin-top:24px; }
  button, a.btn { display:block; text-align:center; padding:12px; border-radius:8px; border:0;
                  font-size:15px; font-weight:600; cursor:pointer; text-decoration:none; }
  .primary { background:var(--green); color:#0b1a10; }
  .secondary { background:transparent; color:var(--text); border:1px solid var(--line) !important; }
  .disabled { opacity:.45; pointer-events:none; }
  code { display:block; word-break:break-all; font-size:12px; color:var(--muted); background:#0f1317;
         padding:10px; border-radius:8px; margin-top:12px; border:1px solid var(--line); }
  footer { margin-top:20px; font-size:12px; color:var(--muted); text-align:center; }
  footer a { color:var(--muted); }
  .langrow { display:flex; align-items:center; gap:10px; margin-top:16px; }
  .langrow label { margin:0; flex:none; }
  .langrow select { width:auto; flex:1; padding:8px 10px; font-size:14px; }
</style>
</head>
<body>
<main>
  <div class="dots"><i style="background:var(--orange)"></i><i style="background:var(--green)"></i><i style="background:var(--blue)"></i></div>
  <h1 data-t="title">Letterboxd for Stremio</h1>
  <p class="sub" data-t="sub">Show public Letterboxd watchlists and lists as catalogs in Stremio. Free, no account needed.</p>
  <div class="langrow">
    <label for="lang" data-t="langLabel">Language</label>
    <select id="lang">${langOptions}</select>
  </div>
  <div class="hint" data-t="langHint">Used on this page and in Stremio (catalog names, sort options, ratings).</div>

  <h2 data-t="wlHead">Watchlists</h2>
  <label for="users" data-t="userLabel">Letterboxd username(s)</label>
  <input id="users" autocomplete="off" autocapitalize="off" spellcheck="false" data-ph="placeholder" placeholder="e.g. dave">
  <div class="hint" data-t="userHint">Separate several with commas to add friends' watchlists too. The watchlist must be public.</div>
  <div class="status" id="userStatus" aria-live="polite"></div>

  <h2 data-t="listHead">Lists</h2>
  <label for="lists" data-t="listLabel">Letterboxd list links (one per line)</label>
  <textarea id="lists" autocomplete="off" autocapitalize="off" spellcheck="false"
    placeholder="https://letterboxd.com/dave/list/imdb-top-250/"></textarea>
  <div class="hint" data-t="listHint">Any public list works, including boxd.it short links. Each list becomes its own catalog.</div>
  <div class="status" id="listStatus" aria-live="polite"></div>

  <h2 data-t="meHead">You (optional)</h2>
  <label for="me" data-t="meLabel">Your Letterboxd username</label>
  <input id="me" autocomplete="off" autocapitalize="off" spellcheck="false" data-ph="placeholder" placeholder="e.g. dave">
  <label class="check off" id="hideWrap">
    <input type="checkbox" id="hideWatched">
    <span><span data-t="hideLabel">Hide films I've already watched</span>
      <span class="hint" style="display:block" data-t="hideHint">Great for friends' watchlists and big lists. Recently watched films may take a few minutes to disappear.</span></span>
  </label>

  <h2 data-t="optHead">Options</h2>
  <label for="sort" data-t="sortLabel">Default order</label>
  <select id="sort">${sortOptions}</select>
  <div class="hint" data-t="sortHint">You can also change the order from the dropdown in Stremio's Discover page.</div>
  <label class="check">
    <input type="checkbox" id="detailRating">
    <span><span data-t="drLabel">Show Letterboxd rating on the film page too</span>
      <span class="hint" style="display:block" data-t="drHint">The rating always shows in the Discover preview. Turning this on also adds it to the film's details page; films then use Letterboxd IDs in your library.</span></span>
  </label>

  <div class="btns">
    <a class="btn primary disabled" id="install" data-t="install">Install in Stremio</a>
    <a class="btn secondary disabled" id="web" target="_blank" rel="noopener" data-t="web">Install in Stremio Web</a>
    <button class="secondary disabled" id="copy" data-t="copy">Copy manifest URL</button>
  </div>
  <code id="url" hidden></code>
  <footer>
    <a href="https://github.com/harunsahinol/letterboxd-stremio" target="_blank" rel="noopener" data-t="source">Open source on GitHub</a>
    · <span data-t="footer">Not affiliated with Letterboxd or Stremio.</span>
  </footer>
</main>
<script>
const ORIGIN = ${JSON.stringify(origin)};
const INITIAL = ${initial};
const I18N = ${i18n};
const fmt = (str, v) => str.replace(/\\{(\\w+)\\}/g, (_, k) => (k in v ? v[k] : "{" + k + "}"));
function detectLang() {
  for (const l of navigator.languages || [navigator.language || "en"]) {
    const code = String(l).toLowerCase().slice(0, 2);
    if (I18N.langs[code]) return code;
  }
  return "en";
}
let lang = INITIAL.lang || detectLang();
let L = I18N.page[lang];
const say = (key, vars) => fmt(L[key] || I18N.page.en[key], vars || {});
function applyLang() {
  L = I18N.page[lang];
  document.documentElement.lang = lang === "zh" ? "zh-CN" : lang;
  document.title = L.title;
  document.querySelectorAll("[data-t]").forEach(el => { if (L[el.dataset.t]) el.textContent = L[el.dataset.t]; });
  document.querySelectorAll("[data-ph]").forEach(el => { el.placeholder = L[el.dataset.ph]; });
  const sortSel = document.getElementById("sort"), cur = sortSel.value;
  sortSel.innerHTML = "";
  Object.entries(I18N.sorts[lang]).forEach(([k, v]) => sortSel.add(new Option(v, k)));
  sortSel.value = cur;
}

const $ = (id) => document.getElementById(id);
const usersEl = $("users"), listsEl = $("lists"), meEl = $("me"), hideEl = $("hideWatched"),
      drEl = $("detailRating"), sortEl = $("sort"), langEl = $("lang");
langEl.value = lang;
applyLang();
usersEl.value = INITIAL.users; listsEl.value = INITIAL.lists; meEl.value = INITIAL.me;
hideEl.checked = INITIAL.hideWatched; drEl.checked = INITIAL.detailRating; sortEl.value = INITIAL.sort;

const USER_RE = /^[a-z0-9_]{1,40}$/;
const cleanUser = (s) => s.trim().toLowerCase().replace(/^https?:\\/\\/(www\\.)?letterboxd\\.com\\//, "").replace(/\\/.*$/, "");
const users = () => usersEl.value.split(/[\\s,]+/).map(cleanUser).filter(Boolean);
const me = () => cleanUser(meEl.value);
const listLines = () => listsEl.value.split(/\\n+/).map(s => s.trim()).filter(Boolean);

// line -> { u, s, n } for lists that can be added
const listInfo = new Map();

function b64url(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = ""; bytes.forEach(b => bin += String.fromCharCode(b));
  return btoa(bin).replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/, "");
}
function config() {
  const u = users().filter(x => USER_RE.test(x));
  const lists = listLines().map(l => listInfo.get(l)).filter(Boolean);
  if (!u.length && !lists.length) return null;
  const cfg = { users: u, lists, sort: sortEl.value, lang };
  if (USER_RE.test(me())) { cfg.me = me(); if (hideEl.checked) cfg.hideWatched = true; }
  if (drEl.checked) cfg.detailRating = true;
  return cfg;
}
function update() {
  $("hideWrap").classList.toggle("off", !USER_RE.test(me()));
  const cfg = config();
  const url = cfg && ORIGIN + "/" + b64url(JSON.stringify(cfg)) + "/manifest.json";
  ["install", "web", "copy"].forEach(id => $(id).classList.toggle("disabled", !url));
  $("url").hidden = !url;
  if (!url) return;
  $("url").textContent = url;
  $("install").href = url.replace(/^https?:\\/\\//, "stremio://");
  $("web").href = "https://web.stremio.com/#/addons?addon=" + encodeURIComponent(url);
}
function show(el, lines) {
  el.innerHTML = "";
  lines.forEach(([cls, text]) => { const d = document.createElement("div"); d.className = cls; d.textContent = text; el.appendChild(d); });
}

let userTimer;
function checkUsers() {
  clearTimeout(userTimer);
  const list = users();
  if (!list.length) return show($("userStatus"), []);
  userTimer = setTimeout(async () => {
    show($("userStatus"), [["", say("checking")]]);
    show($("userStatus"), await Promise.all(list.map(async u => {
      if (!USER_RE.test(u)) return ["err", say("invalid", { u })];
      try {
        const r = await (await fetch(ORIGIN + "/api/check?u=" + encodeURIComponent(u))).json();
        return r.ok ? ["ok", say("found", { u, n: r.count })] : ["err", say(r.error === "notfound" || r.error === "invalid" ? r.error : "upstream", { u })];
      } catch { return ["err", say("upstream", { u })]; }
    })));
  }, 600);
}

let listTimer;
function checkLists() {
  clearTimeout(listTimer);
  const lines = listLines();
  if (!lines.length) { show($("listStatus"), []); return update(); }
  listTimer = setTimeout(async () => {
    show($("listStatus"), [["", say("checking")]]);
    const out = await Promise.all(lines.map(async line => {
      try {
        const r = await (await fetch(ORIGIN + "/api/list?url=" + encodeURIComponent(line))).json();
        if (r.ok) { listInfo.set(line, { u: r.u, s: r.s, n: r.title }); return ["ok", say("listFound", { t: r.title, n: r.count })]; }
        listInfo.delete(line);
        if (r.error === "upstream") {
          const m = line.replace(/^https?:\\/\\/(www\\.)?letterboxd\\.com\\//, "").match(/^([a-z0-9_]+)\\/(?:list\\/)?([a-z0-9-]+)/i);
          if (m) listInfo.set(line, { u: m[1].toLowerCase(), s: m[2].toLowerCase(), n: m[2] });
          return ["err", say("listUpstream", { l: line })];
        }
        return ["err", say(r.error === "notfound" ? "listNotFound" : "listInvalid", { l: line })];
      } catch { return ["err", say("listUpstream", { l: line })]; }
    }));
    show($("listStatus"), out);
    update();
  }, 700);
}

usersEl.addEventListener("input", () => { update(); checkUsers(); });
listsEl.addEventListener("input", () => { update(); checkLists(); });
langEl.addEventListener("change", () => { lang = langEl.value; applyLang(); update(); checkUsers(); checkLists(); });
[meEl, hideEl, drEl, sortEl].forEach(el => el.addEventListener(el.tagName === "INPUT" && el.type !== "checkbox" ? "input" : "change", update));
$("copy").addEventListener("click", async () => {
  const cfg = config(); if (!cfg) return;
  try { await navigator.clipboard.writeText($("url").textContent); } catch {}
  const b = $("copy"), old = b.textContent; b.textContent = say("copied"); setTimeout(() => b.textContent = old, 1500);
});
update(); checkUsers(); checkLists();
</script>
</body>
</html>`;
}
