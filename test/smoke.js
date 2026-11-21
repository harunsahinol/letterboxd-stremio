// Smoke test against the live Letterboxd site: node test/smoke.js [username]
import { handle, encodeConfig } from "../src/addon.js";

const user = process.argv[2] || "dave";
const cfg = encodeConfig({ users: [user], sort: "added" });
const call = async (p) => {
  const t = Date.now();
  const r = await handle(new Request("http://localhost:7001" + p));
  const body = r.headers.get("content-type").includes("json") ? await r.json() : await r.text();
  console.log(r.status, p.slice(0, 80), `${Date.now() - t}ms`);
  return body;
};

const man = await call(`/${cfg}/manifest.json`);
console.log("catalogs:", man.catalogs.map((c) => c.id));
const cat = await call(`/${cfg}/catalog/movie/lbxd-watchlist-${user}.json`);
const ids = cat.metas.map((m) => m.id);
console.log("items:", ids.length, "imdb:", ids.filter((i) => i.startsWith("tt")).length, "lbxd:", ids.filter((i) => i.startsWith("lbxd:")).length);
console.log(cat.metas.slice(0, 3));
const again = await call(`/${cfg}/catalog/movie/lbxd-watchlist-${user}.json`);
const p2 = await call(`/${cfg}/catalog/movie/lbxd-watchlist-${user}/genre=${encodeURIComponent("Release (oldest)")}&skip=100.json`);
console.log("page2 first:", p2.metas.slice(0, 2).map((m) => `${m.name} ${m.releaseInfo}`));
const meta = await call(`/${cfg}/meta/movie/lbxd:parasite-2019.json`);
console.log("meta:", meta.meta.name, meta.meta.id, meta.meta.behaviorHints);
const bad = await call(`/api/check?u=zzqqnotauser123`);
console.log("check bad:", bad);
const page = await call(`/configure`);
console.log("configure html length:", page.length);
