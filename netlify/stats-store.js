// Stores the anonymous usage counts (see src/stats.js) in Netlify Blobs.
//
// Turned on only when the STATS_SECRET environment variable is set, so forks
// and self-hosted copies count nothing unless their owner opts in.
//
// Layout of the "usage" store:
//   seen/<day>/<lang.flags>/<hash>   one key per install active that day
//   view/<day>/<random id>           one key per configure page visit
//   days                             JSON list of finished daily totals
// The scheduled rollup (functions/stats-rollup.js) turns each finished day
// into totals and deletes that day's seen/ and view/ keys.

import { getStore } from "@netlify/blobs";
import { summarizeDay } from "../src/stats.js";

const SECRET = process.env.STATS_SECRET || "";
export const statsEnabled = SECRET.length >= 16;

const store = () => getStore("usage");
const dayOf = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);

// Keyed with a per-day key, so the same install gets a different hash every
// day and can't be followed across days, and hashes can't be checked against
// a guessed install link without the secret.
async function dailyHash(day, value) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(`${SECRET}:${day}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(value)));
  return [...sig.slice(0, 12)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Installs this function instance already recorded today (saves Blob writes).
let seenDay = null;
let seenSet = new Set();

export async function track(ev) {
  if (!statsEnabled) return;
  const day = dayOf();
  if (ev.type === "install") {
    if (seenDay !== day) {
      seenDay = day;
      seenSet = new Set();
    }
    const h = await dailyHash(day, ev.key);
    if (seenSet.has(h)) return;
    seenSet.add(h);
    if (seenSet.size > 50000) seenSet.clear();
    await store().set(`seen/${day}/${ev.tag}/${h}`, "1");
  } else if (ev.type === "view") {
    await store().set(`view/${day}/${crypto.randomUUID()}`, "1");
  }
}

async function listKeys(s, prefix) {
  const { blobs } = await s.list({ prefix });
  return blobs.map((b) => b.key);
}

async function countDay(s, day) {
  const [seen, views] = await Promise.all([listKeys(s, `seen/${day}/`), listKeys(s, `view/${day}/`)]);
  const tags = seen.map((k) => k.split("/")[2]);
  return { summary: summarizeDay(day, tags, views.length), keys: [...seen, ...views] };
}

async function pendingDays(s) {
  const days = new Set();
  for (const prefix of ["seen/", "view/"]) {
    const { directories } = await s.list({ prefix, directories: true });
    for (const d of directories) days.add(d.split("/")[1]);
  }
  return [...days].filter(Boolean).sort();
}

// Finished totals plus live counts for days not rolled up yet (including today).
export async function readStats() {
  const s = store();
  const today = dayOf();
  const done = (await s.get("days", { type: "json" })) || [];
  const have = new Set(done.map((d) => d.day));
  const live = await Promise.all(
    (await pendingDays(s)).filter((d) => !have.has(d)).map(async (d) => (await countDay(s, d)).summary)
  );
  const days = [...done, ...live].sort((a, b) => (a.day < b.day ? -1 : 1));
  if (!days.some((d) => d.day === today)) days.push(summarizeDay(today, [], 0));
  return { today, days };
}

// Rolls every finished day into the "days" list and deletes its per-day keys.
export async function rollup() {
  const s = store();
  const today = dayOf();
  const done = (await s.get("days", { type: "json" })) || [];
  const have = new Set(done.map((d) => d.day));
  const rolled = [];
  for (const day of await pendingDays(s)) {
    if (day >= today) continue;
    const { summary, keys } = await countDay(s, day);
    if (!have.has(day)) {
      done.push(summary);
      have.add(day);
      done.sort((a, b) => (a.day < b.day ? -1 : 1));
      await s.setJSON("days", done);
    }
    for (let i = 0; i < keys.length; i += 20) await Promise.all(keys.slice(i, i + 20).map((k) => s.delete(k)));
    rolled.push(day);
  }
  return rolled;
}
