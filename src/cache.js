// Tiny two-level cache: in-memory LRU (always) + optional shared backend
// (Cloudflare Cache API on Workers). Works on Node, Netlify, Workers, Deno.

const MAX_ENTRIES = 20000;
const mem = new Map(); // key -> { v, exp }

let backend = null; // { get(key) -> value|null, set(key, value, ttl) }

export function setCacheBackend(b) {
  backend = b;
}

export const cache = {
  async get(key) {
    const e = mem.get(key);
    if (e) {
      if (e.exp > Date.now()) {
        mem.delete(key); // refresh LRU position
        mem.set(key, e);
        return e.v;
      }
      mem.delete(key);
    }
    if (backend) {
      try {
        const v = await backend.get(key);
        if (v != null) {
          memSet(key, v, 300);
          return v;
        }
      } catch {}
    }
    return null;
  },
  async set(key, v, ttl) {
    memSet(key, v, ttl);
    if (backend) {
      try {
        await backend.set(key, v, ttl);
      } catch {}
    }
  },
};

function memSet(key, v, ttl) {
  mem.delete(key);
  mem.set(key, { v, exp: Date.now() + ttl * 1000 });
  while (mem.size > MAX_ENTRIES) mem.delete(mem.keys().next().value);
}

// Cloudflare Workers backend using the free, unlimited Cache API.
export function cloudflareCacheBackend() {
  const c = caches.default;
  const url = (key) => "https://cache.internal/" + encodeURIComponent(key);
  return {
    async get(key) {
      const r = await c.match(url(key));
      return r ? r.json() : null;
    },
    async set(key, v, ttl) {
      await c.put(
        url(key),
        new Response(JSON.stringify(v), {
          headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${ttl}` },
        })
      );
    },
  };
}
