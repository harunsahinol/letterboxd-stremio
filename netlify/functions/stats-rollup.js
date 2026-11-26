// Runs shortly after midnight UTC: turns yesterday's anonymous counts into
// daily totals and deletes the per-day hashes (see netlify/stats-store.js).
import { rollup, statsEnabled } from "../stats-store.js";

export default async () => {
  if (!statsEnabled) return new Response("stats disabled");
  const days = await rollup();
  console.log("[stats] rolled up", days.join(", ") || "nothing");
  return new Response("ok");
};

export const config = { schedule: "10 0 * * *" };
