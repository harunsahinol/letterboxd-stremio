// Configuration / install page in English, Turkish, Spanish, French and Mandarin.
// Three steps: 1) what to show, 2) personalize (optional, collapsed), 3) install.

import { LANGS, PAGE, ADDON } from "./i18n.js";

export function configurePage(origin, cfg) {
  const initial = JSON.stringify({
    users: cfg ? cfg.users.join(", ") : "",
    lists: cfg ? cfg.lists.map((l) => `https://letterboxd.com/${l.u}/list/${l.s}/`).join("\n") : "",
    me: cfg && cfg.me ? cfg.me : "",
    hideWatched: cfg ? cfg.hideWatched : false,
    diary: cfg ? cfg.diary : false,
    detailRating: cfg ? cfg.detailRating : false,
    sort: cfg ? cfg.sort : "added",
    lang: cfg ? cfg.lang : null,
  }).replace(/</g, "\\u003c");
  const i18n = JSON.stringify({
    langs: LANGS,
    page: PAGE,
    addon: Object.fromEntries(
      Object.entries(ADDON).map(([l, t]) => [l, { sorts: t.sorts, watchlist: t.watchlist, watchlistOf: t.watchlistOf, diary: t.diary, diaryOf: t.diaryOf }])
    ),
  }).replace(/</g, "\\u003c");
  const langOptions = Object.entries(LANGS)
    .map(([k, v]) => `<option value="${k}">${v}</option>`)
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Letterboxd for Stremio</title>
<link rel="icon" href="https://raw.githubusercontent.com/harunsahinol/letterboxd-stremio/main/docs/logo.png">
<meta property="og:title" content="Letterboxd for Stremio">
<meta property="og:description" content="Your Letterboxd watchlists, lists and diaries as Stremio catalogs. Free, no login.">
<meta property="og:image" content="https://raw.githubusercontent.com/harunsahinol/letterboxd-stremio/main/docs/background.png">
<style>
  :root { --bg:#14181c; --card:#1c2228; --card2:#20272e; --line:#2c3440; --text:#e1e8f0; --muted:#8a9bab;
          --green:#00e054; --orange:#ff8000; --blue:#40bcf4; --red:#ff6b6b; --field:#0f1317; }
  * { box-sizing:border-box; }
  body { margin:0; min-height:100vh; background:var(--bg); color:var(--text);
         font:15px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
         display:flex; justify-content:center; padding:32px 16px 96px; }
  main { width:100%; max-width:480px; }

  /* header */
  .top { display:flex; align-items:center; justify-content:space-between; gap:12px; }
  .brand { display:flex; align-items:center; gap:10px; min-width:0; }
  .logo { width:26px; height:26px; flex:none; display:block; }
  h1 { font-size:20px; margin:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .lang { position:relative; flex:none; }
  .lang select { appearance:none; -webkit-appearance:none; background:var(--card); color:var(--text);
                 border:1px solid var(--line); border-radius:999px; padding:6px 30px 6px 30px; font:inherit; font-size:13px; cursor:pointer; }
  .lang::before { content:"🌐"; position:absolute; left:10px; top:50%; transform:translateY(-50%); font-size:13px; pointer-events:none; }
  .lang::after { content:"▾"; position:absolute; right:11px; top:50%; transform:translateY(-50%); color:var(--muted); font-size:11px; pointer-events:none; }
  p.sub { color:var(--muted); margin:10px 0 22px; font-size:14px; }

  /* steps */
  .step { background:var(--card); border:1px solid var(--line); border-radius:14px; padding:20px; margin-bottom:12px; }
  .step-h, .step > summary { display:flex; align-items:center; gap:10px; margin:0 0 4px; }
  .step > summary { list-style:none; cursor:pointer; margin:0; }
  .step > summary::-webkit-details-marker { display:none; }
  .step[open] > summary { margin-bottom:4px; }
  .num { width:24px; height:24px; border-radius:50%; background:var(--line); color:var(--text); font-size:13px; font-weight:700;
         display:grid; place-items:center; flex:none; }
  h2 { font-size:16px; margin:0; font-weight:650; }
  .tag { font-size:12px; color:var(--muted); border:1px solid var(--line); border-radius:999px; padding:1px 8px; }
  .chev { margin-left:auto; color:var(--muted); transition:transform .15s; }
  .step[open] .chev { transform:rotate(180deg); }

  .field { margin-top:16px; }
  .field > label:not(.check) { display:block; font-size:13px; font-weight:600; margin-bottom:6px; }
  input:not([type=checkbox]), select, textarea { width:100%; padding:10px 12px; border-radius:8px; border:1px solid var(--line);
         background:var(--field); color:var(--text); font:inherit; font-size:15px; }
  .field select { appearance:auto; }
  textarea { min-height:64px; resize:vertical; font-size:14px; }
  input:focus, select:focus, textarea:focus { outline:2px solid var(--blue); outline-offset:0; border-color:transparent; }
  .hint { font-size:12.5px; color:var(--muted); margin-top:6px; }
  .status { font-size:13px; margin-top:6px; display:grid; gap:2px; }
  .status:empty { display:none; }
  .ok { color:var(--green); } .err { color:var(--red); } .wait { color:var(--muted); }

  .check { display:flex; gap:10px; align-items:flex-start; margin-top:16px; cursor:pointer; font-size:14px; font-weight:600; }
  .check input { width:18px; height:18px; margin:1px 0 0; accent-color:var(--green); flex:none; }
  .check .hint { font-weight:400; margin-top:2px; }
  .check.off { display:none; }
  .field .check { margin-top:12px; }

  /* summary + install */
  .summary { margin-top:12px; }
  .summary .empty { color:var(--muted); font-size:14px; }
  .summary .label { font-size:12px; color:var(--muted); text-transform:uppercase; letter-spacing:.06em; margin-bottom:8px; }
  .cat { display:flex; align-items:center; gap:10px; padding:9px 12px; background:var(--card2); border:1px solid var(--line);
         border-radius:8px; margin-bottom:6px; font-size:14px; }
  .cat b { font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .cat span { margin-left:auto; color:var(--muted); font-size:13px; flex:none; }
  .cat i { font-style:normal; flex:none; }
  .note { font-size:13px; color:var(--muted); margin-top:8px; }

  .btns { display:grid; gap:8px; margin-top:16px; }
  .row2 { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
  button, a.btn { display:block; text-align:center; padding:12px; border-radius:8px; border:0; font:inherit;
                  font-size:15px; font-weight:650; cursor:pointer; text-decoration:none; }
  .primary { background:var(--green); color:#0b1a10; }
  .secondary { background:transparent; color:var(--text); border:1px solid var(--line) !important; font-size:14px; padding:10px; }
  .disabled { opacity:.4; pointer-events:none; }
  details.link { margin-top:12px; font-size:13px; color:var(--muted); }
  details.link summary { cursor:pointer; }
  code { display:block; word-break:break-all; font-size:12px; color:var(--muted); background:var(--field);
         padding:10px; border-radius:8px; margin-top:8px; border:1px solid var(--line); }

  footer { margin-top:18px; font-size:12px; color:var(--muted); text-align:center; }
  footer a { color:var(--muted); }
  @media (max-width:420px) {
    .step { padding:16px; }
    .top { align-items:flex-start; }
    h1 { font-size:18px; white-space:normal; line-height:1.25; }
  }
</style>
</head>
<body>
<main>
  <header class="top">
    <div class="brand">
      <svg class="logo" aria-hidden="true" viewBox="0 0 256 256"><rect width="256" height="256" rx="56" fill="#0d1013"/><path d="M78 46h100a10 10 0 0 1 10 10v158l-60-38-60 38V56a10 10 0 0 1 10-10z" fill="#00e054"/><path d="M110 92v62l50-31z" fill="#0d1013"/></svg>
      <h1 data-t="title">Letterboxd for Stremio</h1>
    </div>
    <div class="lang"><select id="lang" aria-label="Language">${langOptions}</select></div>
  </header>
  <p class="sub" data-t="sub">Show public Letterboxd watchlists and lists as catalogs in Stremio. Free, no account needed.</p>

  <section class="step">
    <div class="step-h"><span class="num">1</span><h2 data-t="step1">What should appear in Stremio?</h2></div>
    <div class="field">
      <label for="users" data-t="wlHead">Watchlists</label>
      <input id="users" autocomplete="off" autocapitalize="off" spellcheck="false" data-ph="placeholder" placeholder="dave, friend123">
      <div class="hint" data-t="userHint"></div>
      <div class="status" id="userStatus" aria-live="polite"></div>
      <label class="check off" id="diaryWrap">
        <input type="checkbox" id="diary">
        <span><span data-t="diaryLabel">Also add their diaries</span>
          <span class="hint" style="display:block" data-t="diaryHint"></span></span>
      </label>
    </div>
    <div class="field">
      <label for="lists" data-t="listHead">Lists</label>
      <textarea id="lists" autocomplete="off" autocapitalize="off" spellcheck="false"
        placeholder="https://letterboxd.com/dave/list/imdb-top-250/"></textarea>
      <div class="hint" data-t="listHint"></div>
      <div class="status" id="listStatus" aria-live="polite"></div>
    </div>
  </section>

  <details class="step" id="personal">
    <summary><span class="num">2</span><h2 data-t="step2">Personalize</h2><span class="tag" data-t="optional">optional</span><span class="chev">▾</span></summary>
    <div class="field">
      <label for="me" data-t="meLabel">Your Letterboxd username</label>
      <input id="me" autocomplete="off" autocapitalize="off" spellcheck="false" data-ph="mePlaceholder" placeholder="dave">
      <div class="hint" data-t="meHint"></div>
    </div>
    <label class="check off" id="hideWrap">
      <input type="checkbox" id="hideWatched">
      <span><span data-t="hideLabel">Hide films I've already watched</span>
        <span class="hint" style="display:block" data-t="hideHint"></span></span>
    </label>
    <div class="field">
      <label for="sort" data-t="sortLabel">Default order</label>
      <select id="sort"></select>
      <div class="hint" data-t="sortHint"></div>
    </div>
    <label class="check">
      <input type="checkbox" id="detailRating">
      <span><span data-t="drLabel">Show Letterboxd rating on the film page too</span>
        <span class="hint" style="display:block" data-t="drHint"></span></span>
    </label>
  </details>

  <section class="step">
    <div class="step-h"><span class="num">3</span><h2 data-t="step3">Install</h2></div>
    <div class="summary" id="summary" aria-live="polite"></div>
    <div class="btns">
      <a class="btn primary disabled" id="install" data-t="install">Install in Stremio</a>
      <div class="row2">
        <a class="btn secondary disabled" id="web" target="_blank" rel="noopener" data-t="web">Stremio Web</a>
        <button class="secondary disabled" id="copy" data-t="copy">Copy link</button>
      </div>
    </div>
    <details class="link" id="linkBox" hidden><summary data-t="showLink">Show install link</summary><code id="url"></code></details>
  </section>

  <footer>
    <a href="https://github.com/harunsahinol/letterboxd-stremio" target="_blank" rel="noopener" data-t="source">Open source on GitHub</a>
    · <span data-t="footer">Not affiliated with Letterboxd or Stremio.</span>
  </footer>
</main>
<script>
const ORIGIN = ${JSON.stringify(origin)};
const INITIAL = ${initial};
const I18N = ${i18n};
// Anonymous page-visit count (a plain counter, see /stats). Does nothing on servers without stats.
try { navigator.sendBeacon(ORIGIN + "/api/hit"); } catch {}
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

const $ = (id) => document.getElementById(id);
const usersEl = $("users"), listsEl = $("lists"), meEl = $("me"), hideEl = $("hideWatched"),
      drEl = $("detailRating"), sortEl = $("sort"), langEl = $("lang"), diaryEl = $("diary");

function applyLang() {
  L = I18N.page[lang];
  document.documentElement.lang = lang === "zh" ? "zh-CN" : lang;
  document.title = L.title;
  document.querySelectorAll("[data-t]").forEach(el => { if (L[el.dataset.t]) el.textContent = L[el.dataset.t]; });
  document.querySelectorAll("[data-ph]").forEach(el => { el.placeholder = L[el.dataset.ph]; });
  langEl.setAttribute("aria-label", L.langLabel);
  const cur = sortEl.value || INITIAL.sort;
  sortEl.innerHTML = "";
  Object.entries(I18N.addon[lang].sorts).forEach(([k, v]) => sortEl.add(new Option(v, k)));
  sortEl.value = cur;
}

langEl.value = lang;
applyLang();
usersEl.value = INITIAL.users; listsEl.value = INITIAL.lists; meEl.value = INITIAL.me;
hideEl.checked = INITIAL.hideWatched; diaryEl.checked = INITIAL.diary; drEl.checked = INITIAL.detailRating; sortEl.value = INITIAL.sort;
if (INITIAL.me || INITIAL.detailRating || INITIAL.sort !== "added") $("personal").open = true;

const USER_RE = /^[a-z0-9_]{1,40}$/;
const cleanUser = (s) => s.trim().toLowerCase().replace(/^https?:\\/\\/(www\\.)?letterboxd\\.com\\//, "").replace(/\\/.*$/, "");
const users = () => [...new Set(usersEl.value.split(/[\\s,]+/).map(cleanUser).filter(Boolean))];
const me = () => cleanUser(meEl.value);
const listLines = () => [...new Set(listsEl.value.split(/\\n+/).map(s => s.trim()).filter(Boolean))];

const userInfo = new Map(); // username -> { ok, count, error }
const listInfo = new Map(); // line -> { u, s, n, count }

function b64url(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = ""; bytes.forEach(b => bin += String.fromCharCode(b));
  return btoa(bin).replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/, "");
}
// Users that are valid and not known to be missing.
const goodUsers = () => users().filter(u => USER_RE.test(u) && !(userInfo.get(u) && ["notfound", "invalid"].includes(userInfo.get(u).error)));
const goodLists = () => listLines().map(l => listInfo.get(l)).filter(Boolean);

function config() {
  const u = goodUsers(), lists = goodLists();
  if (!u.length && !lists.length) return null;
  const cfg = { users: u, lists: lists.map(({ u, s, n }) => ({ u, s, n })), sort: sortEl.value, lang };
  if (u.length && diaryEl.checked) cfg.diary = true;
  if (USER_RE.test(me())) { cfg.me = me(); if (hideEl.checked) cfg.hideWatched = true; }
  if (drEl.checked) cfg.detailRating = true;
  return cfg;
}

function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

function renderSummary(cfg) {
  const box = $("summary"); box.innerHTML = "";
  if (!cfg) return box.appendChild(el("div", "empty", say("empty")));
  box.appendChild(el("div", "label", say("youGet")));
  const t = I18N.addon[lang];
  const multi = cfg.users.length > 1 || cfg.lists.length > 0 || !!cfg.diary;
  const solo = cfg.users.length === 1 && !cfg.lists.length;
  const row = (icon, name, count) => {
    const r = el("div", "cat");
    r.append(el("i", null, icon), el("b", null, name));
    if (count != null) r.appendChild(el("span", null, say("films", { n: count })));
    box.appendChild(r);
  };
  cfg.users.forEach(u => row("👤", multi ? fmt(t.watchlistOf, { u }) : t.watchlist, userInfo.get(u) && userInfo.get(u).count));
  if (cfg.diary) cfg.users.forEach(u => row("📖", solo ? t.diary : fmt(t.diaryOf, { u }), null));
  goodLists().forEach(l => row("📋", l.n, l.count));
  if (cfg.hideWatched) box.appendChild(el("div", "note", "👁 " + say("willHide", { u: cfg.me })));
}

function update() {
  $("hideWrap").classList.toggle("off", !USER_RE.test(me()));
  $("diaryWrap").classList.toggle("off", !users().length);
  const cfg = config();
  renderSummary(cfg);
  const url = cfg && ORIGIN + "/" + b64url(JSON.stringify(cfg)) + "/manifest.json";
  ["install", "web", "copy"].forEach(id => $(id).classList.toggle("disabled", !url));
  $("linkBox").hidden = !url;
  if (!url) return;
  $("url").textContent = url;
  $("install").href = url.replace(/^https?:\\/\\//, "stremio://");
  $("web").href = "https://web.stremio.com/#/addons?addon=" + encodeURIComponent(url);
}

function show(box, lines) {
  box.innerHTML = "";
  lines.forEach(([cls, text]) => box.appendChild(el("div", cls, text)));
}

let userTimer;
function checkUsers() {
  clearTimeout(userTimer);
  const list = users();
  if (!list.length) { show($("userStatus"), []); return update(); }
  userTimer = setTimeout(async () => {
    show($("userStatus"), [["wait", say("checking")]]);
    const lines = await Promise.all(list.map(async u => {
      if (!USER_RE.test(u)) { userInfo.set(u, { error: "invalid" }); return ["err", say("invalid", { u })]; }
      try {
        const r = await (await fetch(ORIGIN + "/api/check?u=" + encodeURIComponent(u))).json();
        userInfo.set(u, r.ok ? { ok: true, count: r.count } : { error: r.error });
        if (r.ok) return ["ok", "✓ " + say("found", { u, n: r.count })];
        return ["err", say(r.error === "notfound" || r.error === "invalid" ? r.error : "upstream", { u })];
      } catch { userInfo.set(u, { error: "upstream" }); return ["err", say("upstream", { u })]; }
    }));
    show($("userStatus"), lines);
    update();
  }, 600);
}

let listTimer;
function checkLists() {
  clearTimeout(listTimer);
  const lines = listLines();
  if (!lines.length) { show($("listStatus"), []); return update(); }
  listTimer = setTimeout(async () => {
    show($("listStatus"), [["wait", say("checking")]]);
    const out = await Promise.all(lines.map(async line => {
      try {
        const r = await (await fetch(ORIGIN + "/api/list?url=" + encodeURIComponent(line))).json();
        if (r.ok) { listInfo.set(line, { u: r.u, s: r.s, n: r.title, count: r.count }); return ["ok", "✓ " + say("listFound", { t: r.title, n: r.count })]; }
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
meEl.addEventListener("input", update);
[hideEl, drEl, sortEl, diaryEl].forEach(e => e.addEventListener("change", update));
langEl.addEventListener("change", () => { lang = langEl.value; applyLang(); update(); checkUsers(); checkLists(); });
$("copy").addEventListener("click", async () => {
  if (!config()) return;
  try { await navigator.clipboard.writeText($("url").textContent); } catch {}
  const b = $("copy"); b.textContent = say("copied"); setTimeout(() => b.textContent = say("copy"), 1500);
});
update(); checkUsers(); checkLists();
</script>
</body>
</html>`;
}
