// Netlify Functions (v2, Web Request/Response) adapter. Serves every path.
import { handle } from "../../src/addon.js";

export default async (request, context) => {
  const response = await handle(request, {
    maxResolvePerRequest: 100,
    maxBackgroundResolve: 150,
    // Netlify's free plan stops synchronous functions after 10 s; stop fetching
    // new film pages after ~6 s and return what we have (the rest is filled in
    // by the background warm-up and the next request).
    deadlineMs: 6000,
    waitUntil: context && context.waitUntil ? (p) => context.waitUntil(p.catch(() => {})) : null,
  });

  // Let Netlify's CDN cache responses (durable = shared across all edge nodes),
  // so popular watchlists are served without even invoking the function.
  const cc = response.headers.get("Cache-Control");
  if (cc && cc.startsWith("public")) {
    const maxAge = (cc.match(/max-age=(\d+)/) || [])[1];
    response.headers.set(
      "Netlify-CDN-Cache-Control",
      `public, durable, s-maxage=${maxAge}, stale-while-revalidate=86400`
    );
  }
  return response;
};

export const config = { path: "/*" };
