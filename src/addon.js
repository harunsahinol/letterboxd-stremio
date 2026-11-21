// Runtime-agnostic Stremio addon: (Request) -> Response.
// Used by the Node server, Netlify and Cloudflare Worker adapters.

import { getWatchlist, getFilm, peekFilm, mapLimit, LetterboxdError } from "./letterboxd.js";
import { configurePage } from "./configure.js";

const VERSION = "1.0.0";
const PAGE_SIZE = 100;

export const SORTS = {
  added: "Recently added",
  "added-old": "Oldest added",
  name: "Title (A-Z)",
  "release-new": "Release (newest)",
  "release-old": "Release (oldest)",
  shuffle: "Shuffle (daily)",
};

// ---------- config (base64url JSON in the URL path) ----------

const USERNAME_RE = /^[a-z0-9_]{1,40}$/i;

export function encodeConfig(cfg) {
  return btoa(JSON.stringify(cfg)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeConfig(str) {
  try {
    const json = atob(str.replace(/-/g, "+").replace(/_/g, "/"));
    const cfg = JSON.parse(json);
    const users = (Array.isArray(cfg.users) ? cfg.users : [cfg.users])
      .map((u) => String(u || "").trim().toLowerCase())
      .filter((u) => USERNAME_RE.test(u))
      .slice(0, 10);
    if (!users.length) return null;
    return { users, sort: SORTS[cfg.sort] ? cfg.sort : "added" };
  } catch {
    return null;
  }
}

// ---------- manifest ----------

function manifest(cfg) {
  const base = {
    id: "community.letterboxd.watchlist",
    version: VERSION,
    name: "Letterboxd Watchlist",
    description: "Your Letterboxd watchlist (or anyone's public watchlist) as Stremio catalogs. Free & open source.",
    resources: ["catalog", { name: "meta", types: ["movie", "series"], idPrefixes: ["lbxd:"] }],
    types: ["movie", "series"],
    idPrefixes: ["lbxd:"],
    catalogs: [],
    behaviorHints: { configurable: true, configurationRequired: !cfg },
  };
  if (!cfg) return base;
  const sortNames = Object.values(SORTS);
  base.catalogs = cfg.users.map((u) => ({
    type: "movie",
    id: `lbxd-watchlist-${u}`,
    name: cfg.users.length > 1 ? `${u}'s Watchlist` : "Letterboxd Watchlist",
    extra: [
      { name: "skip", isRequired: false },
      // Stremio shows "genre" as a dropdown in Discover; we use it for sorting.
      { name: "genre", isRequired: false, options: sortNames },
    ],
  }));
  base.description = `Letterboxd watchlist of ${cfg.users.join(", ")}.`;
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

function sortItems(items, sort, user) {
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
      const day = Math.floor(Date.now() / 86400000);
      let h = day;
      for (const c of user) h = (h * 31 + c.charCodeAt(0)) | 0;
      return seededShuffle(a, h);
    }
    default:
      return a;
  }
}

// ---------- catalog ----------

function toMeta(item, film) {
  if (film && film.imdb) {
    return {
      id: film.imdb,
      type: film.type,
      name: item.name,
      releaseInfo: item.year ? String(item.year) : undefined,
      poster: film.poster || `https://images.metahub.space/poster/medium/${film.imdb}/img`,
      posterShape: "poster",
    };
  }
  // Not resolved yet (or no IMDb entry on Letterboxd) -> our own id, meta handler resolves it.
  return {
    id: `lbxd:${item.slug}`,
    type: film ? film.type : "movie",
    name: item.name,
    releaseInfo: item.year ? String(item.year) : undefined,
    poster: film && film.poster ? film.poster : undefined,
    posterShape: "poster",
  };
}

async function catalog(cfg, id, extra, opts) {
  const user = id.replace(/^lbxd-watchlist-/, "");
  if (!cfg.users.includes(user)) return { metas: [] };

  const sortKey = Object.keys(SORTS).find((k) => SORTS[k] === extra.genre) || cfg.sort;
  const skip = Math.max(0, parseInt(extra.skip || "0", 10) || 0);

  const all = sortItems(await getWatchlist(user), sortKey, user);
  const slice = all.slice(skip, skip + PAGE_SIZE);

  const deadline = opts.start + (opts.deadlineMs || Infinity);
  let budget = opts.maxResolvePerRequest;
  let complete = true;
  const metas = await mapLimit(slice, 8, async (item) => {
    let film = await peekFilm(item.slug);
    if (!film && budget > 0 && Date.now() < deadline) {
      budget--;
      try {
        film = await getFilm(item.slug);
      } catch {
        film = null;
      }
    }
    if (!film) complete = false;
    return toMeta(item, film);
  });

  // Warm the cache for the rest of the watchlist in the background so the
  // next request (and next pages) are instant and fully resolved.
  if (opts.waitUntil) {
    opts.waitUntil(warm(all.slice(skip, skip + PAGE_SIZE * 3), opts.maxBackgroundResolve));
  }

  return { metas, complete };
}

async function warm(items, max) {
  const todo = [];
  for (const it of items) {
    if (todo.length >= max) break;
    if (!(await peekFilm(it.slug))) todo.push(it);
  }
  await mapLimit(todo, 4, (it) => getFilm(it.slug).catch(() => null));
}

// ---------- meta (only for lbxd: ids) ----------

async function meta(type, id) {
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
          return { meta: m };
        }
      }
    } catch {}
  }
  return {
    meta: {
      id,
      type: film.type,
      name: slug.replace(/-/g, " "),
      poster: film.poster || undefined,
      background: film.background || undefined,
      description: film.description || undefined,
      links: [{ name: "Letterboxd", category: "Letterboxd", url: `https://letterboxd.com/film/${slug}/` }],
      behaviorHints: film.imdb && film.type === "movie" ? { defaultVideoId: film.imdb } : {},
    },
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

const DEFAULT_OPTS = { maxResolvePerRequest: 100, maxBackgroundResolve: 300, deadlineMs: 0, waitUntil: null };

export async function handle(request, options = {}) {
  const opts = { ...DEFAULT_OPTS, ...options, start: Date.now() };
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";

  if (request.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    if (path === "/" ) return Response.redirect(url.origin + "/configure", 302);

    let m;
    if (path === "/configure" || (m = path.match(/^\/([^/]+)\/configure$/))) {
      const cfg = m ? decodeConfig(m[1]) : null;
      return new Response(configurePage(url.origin, cfg, SORTS), {
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=3600" },
      });
    }

    if (path === "/manifest.json") return json(manifest(null), 3600);

    if (path === "/api/check") {
      // Used by the configure page to validate a username.
      const u = (url.searchParams.get("u") || "").trim().toLowerCase();
      if (!USERNAME_RE.test(u)) return json({ ok: false, error: "invalid" });
      try {
        const list = await getWatchlist(u);
        return json({ ok: true, count: list.length });
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
      return json(await meta(m[1], id), 86400);
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
