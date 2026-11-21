// Letterboxd scraping: watchlist pages + film pages (for IMDb/TMDB IDs).
// Only plain URLs are used; sorted URLs (/by/release/ etc.) are blocked by
// Letterboxd's Cloudflare, so sorting is done locally in addon.js.

import { cache } from "./cache.js";

const BASE = "https://letterboxd.com";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";

const WATCHLIST_TTL = 15 * 60; // seconds
const FILM_TTL = 30 * 24 * 60 * 60; // film -> IMDb mapping practically never changes
const MAX_PAGES = 60; // 60 * 28 = 1680 films, safety cap

export class LetterboxdError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function get(path) {
  const res = await fetch(BASE + path, {
    headers: { "User-Agent": UA, Accept: "text/html", "Accept-Language": "en" },
    redirect: "follow",
  });
  if (res.status === 404) throw new LetterboxdError("Not found: " + path, 404);
  if (!res.ok) throw new LetterboxdError(`Letterboxd ${res.status} for ${path}`, res.status);
  return res.text();
}

const decode = (s) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));

function attr(tag, name) {
  const m = tag.match(new RegExp(`${name}="([^"]*)"`));
  return m ? decode(m[1]) : null;
}

// Parses one watchlist page. Supports the current React "LazyPoster" markup
// and the older "film-poster" markup as a fallback.
export function parseWatchlistPage(html) {
  const items = [];
  const tags =
    html.match(/<div[^>]*data-component-class="LazyPoster"[^>]*>/g) ||
    html.match(/<div[^>]*class="[^"]*film-poster[^"]*"[^>]*>/g) ||
    [];
  for (const tag of tags) {
    const slug =
      attr(tag, "data-item-slug") ||
      attr(tag, "data-film-slug") ||
      (attr(tag, "data-target-link") || "").replace(/^\/film\/|\/$/g, "");
    if (!slug) continue;
    const full = attr(tag, "data-item-full-display-name") || attr(tag, "data-item-name") || slug;
    const ym = full.match(/^(.*)\s\((\d{4})\)$/);
    items.push({
      slug,
      name: ym ? ym[1] : full,
      year: ym ? +ym[2] : null,
    });
  }
  const pageNums = [...html.matchAll(/\/watchlist\/page\/(\d+)\//g)].map((m) => +m[1]);
  const lastPage = pageNums.length ? Math.max(...pageNums) : 1;
  return { items, lastPage };
}

async function mapLimit(list, limit, fn) {
  const out = new Array(list.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, list.length) }, async () => {
    while (i < list.length) {
      const idx = i++;
      out[idx] = await fn(list[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}

// Returns the full watchlist (default Letterboxd order = most recently added first).
export async function getWatchlist(username) {
  const user = username.toLowerCase();
  const key = `wl:${user}`;
  const cached = await cache.get(key);
  if (cached) return cached;

  const first = parseWatchlistPage(await get(`/${encodeURIComponent(user)}/watchlist/`));
  const last = Math.min(first.lastPage, MAX_PAGES);
  const rest = await mapLimit(
    Array.from({ length: Math.max(0, last - 1) }, (_, k) => k + 2),
    6,
    async (p) => parseWatchlistPage(await get(`/${encodeURIComponent(user)}/watchlist/page/${p}/`)).items
  );

  const seen = new Set();
  const all = [];
  for (const it of [first.items, ...rest].flat()) {
    if (seen.has(it.slug)) continue;
    seen.add(it.slug);
    all.push(it);
  }
  await cache.set(key, all, WATCHLIST_TTL);
  return all;
}

export function parseFilmPage(html) {
  const imdb = html.match(/imdb\.com\/title\/(tt\d+)/);
  const tmdbType = html.match(/data-tmdb-type="(movie|tv)"/);
  const tmdbId = html.match(/data-tmdb-id="(\d+)"/);
  let poster = null;
  let description = null;
  const ld = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (ld) {
    try {
      // Letterboxd wraps JSON-LD in /* <![CDATA[ */ ... /* ]]> */
      const json = JSON.parse(ld[1].replace(/\/\*.*?\*\//g, "").trim());
      poster = json.image || null;
    } catch {}
  }
  const desc = html.match(/<meta name="description" content="([^"]*)"/);
  if (desc) description = decode(desc[1]);
  const bg = html.match(/<meta property="og:image" content="([^"]*)"/);
  return {
    imdb: imdb ? imdb[1] : null,
    tmdb: tmdbId ? +tmdbId[1] : null,
    type: tmdbType && tmdbType[1] === "tv" ? "series" : "movie",
    poster,
    background: bg ? decode(bg[1]) : null,
    description,
  };
}

// slug -> { imdb, tmdb, type, poster, ... }  (cached for a long time)
export async function getFilm(slug) {
  const key = `film:${slug}`;
  const cached = await cache.get(key);
  if (cached) return cached;
  const info = parseFilmPage(await get(`/film/${encodeURIComponent(slug)}/`));
  await cache.set(key, info, FILM_TTL);
  return info;
}

export async function peekFilm(slug) {
  return cache.get(`film:${slug}`);
}

export { mapLimit };
