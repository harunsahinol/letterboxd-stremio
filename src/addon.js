// Runtime-agnostic Stremio addon: (Request) -> Response.
// Used by the Node server, Netlify and Cloudflare Worker adapters.

import {
  getWatchlist,
  getList,
  getFilm,
  peekFilm,
  getWatchedSeed,
  peekWatched,
  checkWatched,
  mapLimit,
  LetterboxdError,
} from "./letterboxd.js";
import { configurePage } from "./configure.js";
import { ADDON, LANGS, DEFAULT_LANG, addonStrings, fmt, formatRating } from "./i18n.js";

const VERSION = "1.2.0";
const PAGE_SIZE = 100;

// Sort keys; labels come from i18n.js in the user's language.
export const SORTS = ADDON.en.sorts;

const sortLabels = (lang, isList) => {
  const t = addonStrings(lang);
  return isList ? { ...t.sorts, ...t.listSorts } : t.sorts;
};

// Stremio sends back the label picked in the dropdown; match it in any language.
function sortKeyFromLabel(label, lang, isList) {
  if (!label) return null;
  const own = sortLabels(lang, isList);
  const hit = Object.keys(own).find((k) => own[k] === label);
  if (hit) return hit;
  for (const l of Object.keys(LANGS)) {
    for (const isL of [false, true]) {
      const labels = sortLabels(l, isL);
      const k = Object.keys(labels).find((key) => labels[key] === label);
      if (k) return k;
    }
  }
  return null;
}

// ---------- config (base64url JSON in the URL path) ----------
// { users: ["dave"], lists: [{u:"dave", s:"imdb-top-250", n:"IMDb Top 250"}],
//   me: "dave", hideWatched: true, detailRating: false, sort: "added", lang: "en" }

const USERNAME_RE = /^[a-z0-9_]{1,40}$/i;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,120}$/i;

function b64urlEncode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(str) {
  const bin = atob(str.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export function encodeConfig(cfg) {
  return b64urlEncode(JSON.stringify(cfg));
}

export function decodeConfig(str) {
  try {
    const cfg = JSON.parse(b64urlDecode(str));
    const users = (Array.isArray(cfg.users) ? cfg.users : cfg.users ? [cfg.users] : [])
      .map((u) => String(u || "").trim().toLowerCase())
      .filter((u) => USERNAME_RE.test(u))
      .slice(0, 10);
    const lists = (Array.isArray(cfg.lists) ? cfg.lists : [])
      .filter((l) => l && USERNAME_RE.test(l.u) && SLUG_RE.test(l.s))
      .map((l) => ({ u: l.u.toLowerCase(), s: l.s.toLowerCase(), n: String(l.n || l.s).slice(0, 80) }))
      .slice(0, 15);
    if (!users.length && !lists.length) return null;
    const me = USERNAME_RE.test(cfg.me || "") ? cfg.me.toLowerCase() : null;
    return {
      users,
      lists,
      me,
      hideWatched: !!(me && cfg.hideWatched),
      detailRating: !!cfg.detailRating,
      sort: SORTS[cfg.sort] ? cfg.sort : "added",
      lang: LANGS[cfg.lang] ? cfg.lang : DEFAULT_LANG,
    };
  } catch {
    return null;
  }
}

// Accepts a list URL in any common form and returns { u, s } or null.
export function parseListInput(input) {
  const t = String(input || "").trim().replace(/^https?:\/\//, "").replace(/^(www\.)?letterboxd\.com\//, "");
  const m = t.match(/^([a-z0-9_]+)\/(?:list\/)?([a-z0-9][a-z0-9-]*)\/?/i);
  return m && USERNAME_RE.test(m[1]) ? { u: m[1].toLowerCase(), s: m[2].toLowerCase() } : null;
}

// ---------- manifest ----------

function catalogDef(id, name, labels) {
  return {
    type: "movie",
    id,
    name,
    extra: [
      { name: "skip", isRequired: false },
      // Stremio shows "genre" as a dropdown in Discover; we use it for sorting.
      { name: "genre", isRequired: false, options: Object.values(labels) },
    ],
  };
}

function manifest(cfg) {
  const base = {
    id: "community.letterboxd.watchlist",
    version: VERSION,
    name: "Letterboxd",
    description:
      "Letterboxd watchlists and lists as Stremio catalogs, with Letterboxd ratings and an option to hide films you've already watched. Free & open source.",
    resources: ["catalog", { name: "meta", types: ["movie", "series"], idPrefixes: ["lbxd:"] }],
    types: ["movie", "series"],
    idPrefixes: ["lbxd:"],
    catalogs: [],
    behaviorHints: { configurable: true, configurationRequired: !cfg },
  };
  if (!cfg) return base;
  const t = addonStrings(cfg.lang);
  const multi = cfg.users.length > 1 || cfg.lists.length > 0;
  base.catalogs = [
    ...cfg.users.map((u) =>
      catalogDef(`lbxd-watchlist-${u}`, multi ? fmt(t.watchlistOf, { u }) : t.watchlist, sortLabels(cfg.lang, false))
    ),
    ...cfg.lists.map((l) => catalogDef(`lbxd-list-${l.u}~${l.s}`, l.n, sortLabels(cfg.lang, true))),
  ];
  base.description =
    "Letterboxd · " +
    base.catalogs.map((c) => c.name).join(" · ") +
    (cfg.hideWatched ? ` (${fmt(t.hiding, { u: cfg.me })})` : "");
  return base;
}

// ---------- sorting ----------

function seededShuffle(arr, seed) {
  let s = seed >>> 0 || 1;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function sortItems(items, sort, seedStr) {
  const a = items.slice();
  switch (sort) {
    case "added-old":
      return a.reverse();
    case "name":
      return a.sort((x, y) => x.name.localeCompare(y.name));
    case "release-new":
      return a.sort((x, y) => (y.year || 0) - (x.year || 0));
    case "release-old":
      return a.sort((x, y) => (x.year || 9999) - (y.year || 9999));
    case "shuffle": {
      let h = Math.floor(Date.now() / 86400000);
      for (const c of seedStr) h = (h * 31 + c.charCodeAt(0)) | 0;
      return seededShuffle(a, h);
    }
    default:
      return a;
  }
}

// ---------- catalog ----------

const ratingText = (r, lang) => fmt(addonStrings(lang).rating, { r: formatRating(r, lang) });

function toMeta(item, film, cfg) {
  const releaseInfo = item.year ? String(item.year) : undefined;
  const description = film && film.rating ? ratingText(film.rating, cfg.lang) : undefined;
  if (film && film.imdb && !cfg.detailRating) {
    return {
      id: film.imdb,
      type: film.type,
      name: item.name,
      releaseInfo,
      description,
      poster: film.poster || `https://images.metahub.space/poster/medium/${film.imdb}/img`,
      posterShape: "poster",
    };
  }
  // Not resolved yet, no IMDb entry, or "rating on details page" is on ->
  // our own id; the meta handler below fills in the details.
  return {
    id: `lbxd:${item.slug}`,
    type: film ? film.type : "movie",
    name: item.name,
    releaseInfo,
    description,
    poster: film && film.poster ? film.poster : undefined,
    posterShape: "poster",
  };
}

// Per-request budget for Letterboxd fetches. Film pages and watched checks get
// separate budgets so one can't starve the other; both share the deadline.
function makeBudget(opts, max) {
  const deadline = opts.start + (opts.deadlineMs || Infinity);
  let left = max;
  return () => (left > 0 && Date.now() < deadline ? (left--, true) : false);
}

async function loadSource(cfg, id) {
  let m;
  if ((m = id.match(/^lbxd-watchlist-(.+)$/)) && cfg.users.includes(m[1])) {
    return { items: await getWatchlist(m[1]), isList: false, seed: m[1] };
  }
  if ((m = id.match(/^lbxd-list-([^~]+)~(.+)$/)) && cfg.lists.some((l) => l.u === m[1] && l.s === m[2])) {
    return { items: (await getList(m[1], m[2])).items, isList: true, seed: id };
  }
  return null;
}

async function catalog(cfg, id, extra, opts) {
  const src = await loadSource(cfg, id);
  if (!src) return { metas: [], complete: true };

  const sortKey = sortKeyFromLabel(extra.genre, cfg.lang, src.isList) || cfg.sort;
  const skip = Math.max(0, parseInt(extra.skip || "0", 10) || 0);
  let all = sortItems(src.items, sortKey, src.seed);
  const spendFilm = makeBudget(opts, opts.maxResolvePerRequest);
  const spendWatched = makeBudget(opts, opts.maxWatchedPerRequest);
  let complete = true;

  // Hide watched: drop everything already known to be watched before paging,
  // so `skip` stays consistent across requests.
  let watched = null;
  if (cfg.hideWatched) {
    watched = await getWatchedSeed(cfg.me).catch(() => new Set());
    const known = await Promise.all(all.map((it) => (watched.has(it.slug) ? true : peekWatched(cfg.me, it.slug))));
    all = all.filter((_, i) => known[i] !== true);
  }

  // Walk forward from `skip` until we have a full page. Unknown watched status
  // is checked (within budget); if the budget runs out the film is shown.
  const page = [];
  let i = skip;
  while (page.length < PAGE_SIZE && i < all.length) {
    const chunk = all.slice(i, i + (PAGE_SIZE - page.length));
    i += chunk.length;
    const keep = await mapLimit(chunk, 8, async (it) => {
      if (!watched) return true;
      if ((await peekWatched(cfg.me, it.slug)) != null) return !(await peekWatched(cfg.me, it.slug));
      if (!spendWatched()) return (complete = false), true;
      try {
        return !(await checkWatched(cfg.me, it.slug));
      } catch {
        return (complete = false), true;
      }
    });
    chunk.forEach((it, k) => keep[k] && page.push(it));
  }

  const metas = await mapLimit(page, 8, async (item) => {
    let film = await peekFilm(item.slug);
    if (!film && spendFilm()) film = await getFilm(item.slug).catch(() => null);
    if (!film) complete = false;
    return toMeta(item, film, cfg);
  });

  // Warm the cache for the next pages in the background so later requests
  // are instant and fully resolved.
  if (opts.waitUntil) {
    opts.waitUntil(warm(all.slice(skip, skip + PAGE_SIZE * 3), cfg, opts.maxBackgroundResolve));
  }

  return { metas, complete };
}

async function warm(items, cfg, max) {
  const todo = [];
  for (const it of items) {
    if (todo.length >= max) break;
    const needFilm = !(await peekFilm(it.slug));
    const needWatched = cfg.hideWatched && (await peekWatched(cfg.me, it.slug)) == null;
    if (needFilm || needWatched) todo.push({ it, needFilm, needWatched });
  }
  await mapLimit(todo, 4, async ({ it, needFilm, needWatched }) => {
    if (needFilm) await getFilm(it.slug).catch(() => null);
    if (needWatched) await checkWatched(cfg.me, it.slug).catch(() => null);
  });
}

// ---------- meta (only for lbxd: ids) ----------

function addLetterboxdInfo(m, slug, film, lang) {
  const url = `https://letterboxd.com/film/${slug}/`;
  if (film.rating) {
    m.description = `${ratingText(film.rating, lang)}${m.description ? `\n\n${m.description}` : ""}`;
  }
  m.links = [
    ...(m.links || []),
    {
      name: film.rating ? `★ ${formatRating(film.rating, lang)} Letterboxd` : "Letterboxd",
      category: "Letterboxd",
      url,
    },
  ];
  return m;
}

async function meta(type, id, lang) {
  const slug = id.replace(/^lbxd:/, "");
  const film = await getFilm(slug);
  if (film.imdb) {
    try {
      const r = await fetch(`https://v3-cinemeta.strem.io/meta/${film.type}/${film.imdb}.json`);
      if (r.ok) {
        const { meta: m } = await r.json();
        if (m) {
          m.id = id;
          m.behaviorHints = { ...(m.behaviorHints || {}) };
          if (film.type === "movie") m.behaviorHints.defaultVideoId = film.imdb;
          return { meta: addLetterboxdInfo(m, slug, film, lang) };
        }
      }
    } catch {}
  }
  return {
    meta: addLetterboxdInfo(
      {
        id,
        type: film.type,
        name: slug.replace(/-/g, " "),
        poster: film.poster || undefined,
        background: film.background || undefined,
        description: film.description || undefined,
        behaviorHints: film.imdb && film.type === "movie" ? { defaultVideoId: film.imdb } : {},
      },
      slug,
      film,
      lang
    ),
  };
}

// ---------- HTTP ----------

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function json(data, maxAge = 0, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": maxAge
        ? `public, max-age=${maxAge}, s-maxage=${maxAge}, stale-while-revalidate=86400`
        : "no-cache",
    },
  });
}

function parseExtra(str) {
  const out = {};
  if (!str) return out;
  for (const part of str.split("&")) {
    const [k, v = ""] = part.split("=");
    out[decodeURIComponent(k)] = decodeURIComponent(v);
  }
  return out;
}

async function resolveShortLink(input) {
  // boxd.it short links redirect to the full Letterboxd URL.
  const m = String(input).match(/boxd\.it\/([A-Za-z0-9]+)/);
  if (!m) return input;
  const r = await fetch(`https://boxd.it/${m[1]}`, { redirect: "manual" });
  return r.headers.get("location") || input;
}

const DEFAULT_OPTS = {
  maxResolvePerRequest: 100,
  maxWatchedPerRequest: 60,
  maxBackgroundResolve: 300,
  deadlineMs: 0,
  waitUntil: null,
};

export async function handle(request, options = {}) {
  const opts = { ...DEFAULT_OPTS, ...options, start: Date.now() };
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";

  if (request.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    if (path === "/") return Response.redirect(url.origin + "/configure", 302);

    let m;
    if (path === "/configure" || (m = path.match(/^\/([^/]+)\/configure$/))) {
      const cfg = m ? decodeConfig(m[1]) : null;
      return new Response(configurePage(url.origin, cfg), {
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300" },
      });
    }

    if (path === "/manifest.json") return json(manifest(null), 3600);

    // Used by the configure page to validate a username.
    if (path === "/api/check") {
      const u = (url.searchParams.get("u") || "").trim().toLowerCase();
      if (!USERNAME_RE.test(u)) return json({ ok: false, error: "invalid" });
      try {
        const list = await getWatchlist(u);
        return json({ ok: true, count: list.length }, 300);
      } catch (e) {
        return json({ ok: false, error: e.status === 404 ? "notfound" : "upstream" });
      }
    }

    // Used by the configure page to validate a list URL and get its title.
    if (path === "/api/list") {
      const parsed = parseListInput(await resolveShortLink(url.searchParams.get("url") || ""));
      if (!parsed) return json({ ok: false, error: "invalid" });
      try {
        const list = await getList(parsed.u, parsed.s);
        return json({ ok: true, ...parsed, title: list.title || parsed.s, count: list.items.length }, 300);
      } catch (e) {
        return json({ ok: false, error: e.status === 404 ? "notfound" : "upstream" });
      }
    }

    const [, cfgStr, rest] = path.match(/^\/([^/]+)(\/.*)$/) || [];
    const cfg = cfgStr ? decodeConfig(cfgStr) : null;
    if (!cfg) return json({ error: "invalid config" }, 0, 404);

    if (rest === "/manifest.json") return json(manifest(cfg), 3600);

    if ((m = rest.match(/^\/catalog\/([^/]+)\/([^/]+?)(?:\/([^/]+))?\.json$/))) {
      const { metas, complete } = await catalog(cfg, decodeURIComponent(m[2]), parseExtra(m[3]), opts);
      return json({ metas }, complete ? 900 : 20);
    }

    if ((m = rest.match(/^\/meta\/([^/]+)\/([^/]+)\.json$/))) {
      const id = decodeURIComponent(m[2]);
      if (!id.startsWith("lbxd:")) return json({ meta: null }, 0, 404);
      return json(await meta(m[1], id, cfg.lang), 86400);
    }

    return json({ error: "not found" }, 0, 404);
  } catch (e) {
    const status = e instanceof LetterboxdError && e.status === 404 ? 404 : 502;
    console.error("[addon]", e && e.message);
    // Stremio prefers an empty result over an error for catalogs.
    if (/\/catalog\//.test(path)) return json({ metas: [] }, 0, 200);
    return json({ error: e.message }, 0, status);
  }
}
