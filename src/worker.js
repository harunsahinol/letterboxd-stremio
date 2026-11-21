// Cloudflare Workers adapter (experimental: the free plan allows 50 subrequests
// per request, so very large watchlists fill in over a few refreshes).
import { handle } from "./addon.js";
import { setCacheBackend, cloudflareCacheBackend } from "./cache.js";

export default {
  async fetch(request, env, ctx) {
    setCacheBackend(cloudflareCacheBackend());
    return handle(request, {
      maxResolvePerRequest: 20,
      maxBackgroundResolve: 20,
      waitUntil: (p) => ctx.waitUntil(p.catch(() => {})),
    });
  },
};
