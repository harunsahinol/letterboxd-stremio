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
  const pageNums = [...html.matchAll(/\/page\/(\d+)\//g)].map((m) => +m[1]);
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

// Fetches every page of a poster grid (watchlist or list) and returns the
// de-duplicated items in Letterboxd's order. `path` ends with a slash.
async function getPosterGrid(path, key) {
  const cached = await cache.get(key);
  if (cached) return cached;

  const firstHtml = await get(path);
  const first = parseWatchlistPage(firstHtml);
  const last = Math.min(first.lastPage, MAX_PAGES);
  const rest = await mapLimit(
    Array.from({ length: Math.max(0, last - 1) }, (_, k) => k + 2),
    6,
    async (p) => parseWatchlistPage(await get(`${path}page/${p}/`)).items
  );

  const seen = new Set();
  const items = [];
  for (const it of [first.items, ...rest].flat()) {
    if (seen.has(it.slug)) continue;
    seen.add(it.slug);
    items.push(it);
  }
  const og = firstHtml.match(/<meta property="og:title" content="([^"]*)"/);
  const result = { items, title: og ? decode(og[1]) : null };
  await cache.set(key, result, WATCHLIST_TTL);
  return result;
}

// Full watchlist (default Letterboxd order = most recently added first).
export async function getWatchlist(username) {
  const user = username.toLowerCase();
  return (await getPosterGrid(`/${encodeURIComponent(user)}/watchlist/`, `wl:${user}`)).items;
}

// A user's list: letterboxd.com/<user>/list/<slug>/ -> { items, title }
export async function getList(username, slug) {
  const user = username.toLowerCase();
  return getPosterGrid(`/${encodeURIComponent(user)}/list/${encodeURIComponent(slug)}/`, `list:${user}/${slug}`);
}

// ---------- diary (RSS: the user's ~50 most recent diary entries) ----------

export function parseDiaryRss(xml) {
  const out = [];
  const seen = new Set();
  for (const [, item] of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const title = item.match(/<letterboxd:filmTitle>([\s\S]*?)<\/letterboxd:filmTitle>/);
    const link = item.match(/<link>https?:\/\/letterboxd\.com\/[^/]+\/film\/([^/<]+)\//);
    if (!title || !link || seen.has(link[1])) continue;
    seen.add(link[1]);
    const year = item.match(/<letterboxd:filmYear>(\d{4})</);
    const rating = item.match(/<letterboxd:memberRating>([\d.]+)</);
    const date = item.match(/<letterboxd:watchedDate>([\d-]+)</);
    out.push({
      slug: link[1],
      name: decode(title[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim()),
      year: year ? +year[1] : null,
      userRating: rating ? parseFloat(rating[1]) : null,
      watched: date ? date[1] : null,
      liked: /<letterboxd:memberLike>Yes</.test(item),
    });
  }
  return out;
}

export async function getDiary(username) {
  const user = username.toLowerCase();
  const key = `diary:${user}`;
  const cached = await cache.get(key);
  if (cached) return cached;
  const items = parseDiaryRss(await get(`/${encodeURIComponent(user)}/rss/`));
  await cache.set(key, items, WATCHLIST_TTL);
  return items;
}

// ---------- watched films ----------
// The full /films/ grid is blocked for bots beyond page 1, so we combine:
//  1. a cheap seed: /<user>/films/ page 1 + the diary RSS (most recent films)
//  2. per-film checks: /<user>/film/<slug>/ is 200 if watched, 404 if not.

const WATCHED_SEED_TTL = 30 * 60;
const WATCHED_YES_TTL = 30 * 24 * 60 * 60; // watched never "un-happens"
const WATCHED_NO_TTL = 6 * 60 * 60;

export async function getWatchedSeed(username) {
  const user = username.toLowerCase();
  const key = `wseed:${user}`;
  const cached = await cache.get(key);
  if (cached) return new Set(cached);
  const slugs = new Set();
  const [films, rss] = await Promise.allSettled([get(`/${encodeURIComponent(user)}/films/`), getDiary(user)]);
  if (films.status === "fulfilled") parseWatchlistPage(films.value).items.forEach((it) => slugs.add(it.slug));
  if (rss.status === "fulfilled") rss.value.forEach((it) => slugs.add(it.slug));
  if (films.status === "rejected" && rss.status === "rejected") throw films.reason;
  await cache.set(key, [...slugs], WATCHED_SEED_TTL);
  return slugs;
}

// Cached status only: true / false / null (unknown).
export async function peekWatched(username, slug) {
  const v = await cache.get(`w:${username.toLowerCase()}:${slug}`);
  return v == null ? null : v === 1;
}

export async function checkWatched(username, slug) {
  const user = username.toLowerCase();
  const key = `w:${user}:${slug}`;
  const cached = await cache.get(key);
  if (cached != null) return cached === 1;
  const res = await fetch(`${BASE}/${encodeURIComponent(user)}/film/${encodeURIComponent(slug)}/`, {
    headers: { "User-Agent": UA, Accept: "text/html" },
    redirect: "follow",
  });
  if (res.status === 200 || res.status === 404) {
    const watched = res.status === 200;
    await cache.set(key, watched ? 1 : 0, watched ? WATCHED_YES_TTL : WATCHED_NO_TTL);
    return watched;
  }
  throw new LetterboxdError(`Letterboxd ${res.status} for watched check`, res.status);
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
  const rating = html.match(/<meta name="twitter:data2" content="([\d.]+) out of 5"/);
  const genres = [...new Set([...html.matchAll(/href="\/films\/genre\/([a-z-]+)\/"/g)].map((m) => m[1]))];
  return {
    imdb: imdb ? imdb[1] : null,
    tmdb: tmdbId ? +tmdbId[1] : null,
    type: tmdbType && tmdbType[1] === "tv" ? "series" : "movie",
    poster,
    background: bg ? decode(bg[1]) : null,
    description,
    rating: rating ? Math.round(parseFloat(rating[1]) * 10) / 10 : null,
    genres,
  };
}

// slug -> { imdb, tmdb, type, poster, ... }  (cached for a long time)
export async function getFilm(slug) {
  const key = `film2:${slug}`;
  const cached = await cache.get(key);
  if (cached) return cached;
  const info = parseFilmPage(await get(`/film/${encodeURIComponent(slug)}/`));
  await cache.set(key, info, FILM_TTL);
  return info;
}

export async function peekFilm(slug) {
  return cache.get(`film2:${slug}`);
}

export { mapLimit };
