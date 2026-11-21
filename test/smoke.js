// Smoke test against the live Letterboxd site:
//   node test/smoke.js [username] [listUser/listSlug]
import { handle, encodeConfig } from "../src/addon.js";

const user = process.argv[2] || "dave";
const [lu, ls] = (process.argv[3] || "dave/imdb-top-250").split("/");
const call = async (p) => {
  const t = Date.now();
  const r = await handle(new Request("http://localhost:7001" + p));
  const body = r.headers.get("content-type").includes("json") ? await r.json() : await r.text();
  console.log(r.status, p.slice(0, 90), `${Date.now() - t}ms`);
  return body;
};
const count = (metas) => {
  const ids = metas.map((m) => m.id);
  return `${ids.length} items, ${ids.filter((i) => i.startsWith("tt")).length} imdb, ${metas.filter((m) => m.description).length} rated`;
};

// 1) list validation endpoint
const li = await call(`/api/list?url=${encodeURIComponent(`https://letterboxd.com/${lu}/list/${ls}/`)}`);
console.log("list check:", li);

// 2) watchlist + list, no hiding
const cfg = encodeConfig({ users: [user], lists: [{ u: li.u, s: li.s, n: li.title }], sort: "added" });
const man = await call(`/${cfg}/manifest.json`);
console.log("catalogs:", man.catalogs.map((c) => `${c.id} "${c.name}"`));
const wl = await call(`/${cfg}/catalog/movie/lbxd-watchlist-${user}.json`);
console.log("watchlist:", count(wl.metas), wl.metas[0]);
const list = await call(`/${cfg}/catalog/movie/lbxd-list-${li.u}~${li.s}.json`);
console.log("list:", count(list.metas), "first:", list.metas.slice(0, 3).map((m) => m.name));

// 3) same list, hiding films `user` has watched
const cfgHide = encodeConfig({ users: [], lists: [{ u: li.u, s: li.s, n: li.title }], me: user, hideWatched: true });
let hid;
for (let i = 0; i < 3; i++) hid = await call(`/${cfgHide}/catalog/movie/lbxd-list-${li.u}~${li.s}.json`);
const shown = new Set(hid.metas.map((m) => m.name));
console.log("list w/ hide:", count(hid.metas), "| hidden from first 100:", list.metas.filter((m) => !shown.has(m.name)).map((m) => m.name).slice(0, 8));

// 4) rating on details page
const cfgDr = encodeConfig({ users: [user], detailRating: true });
const dr = await call(`/${cfgDr}/catalog/movie/lbxd-watchlist-${user}.json`);
console.log("detailRating ids:", dr.metas.slice(0, 2).map((m) => m.id));
const meta = await call(`/${cfgDr}/meta/movie/lbxd:parasite-2019.json`);
console.log("meta:", meta.meta.name, meta.meta.description.split("\n")[0], meta.meta.links.at(-1), meta.meta.behaviorHints.defaultVideoId);

// 5) old (v1.0) config still works
const old = await call(`/eyJ1c2VycyI6WyJkYXZlIl0sInNvcnQiOiJhZGRlZCJ9/manifest.json`);
console.log("old config catalogs:", old.catalogs.map((c) => c.id));
