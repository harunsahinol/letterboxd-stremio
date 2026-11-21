// Plain Node.js server (local, Render, Koyeb, Fly.io, Railway, Docker, a Raspberry Pi...).
import http from "node:http";
import { handle } from "./addon.js";

const PORT = process.env.PORT || 7001;

http
  .createServer(async (req, res) => {
    const proto = req.headers["x-forwarded-proto"] || "http";
    const host = process.env.PUBLIC_HOST || req.headers["x-forwarded-host"] || req.headers.host;
    const request = new Request(`${proto}://${host}${req.url}`, { method: req.method });
    const response = await handle(request, {
      waitUntil: (p) => p.catch(() => {}), // long-lived process: just let it run
    });
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  })
  .listen(PORT, () => console.log(`Letterboxd addon: http://localhost:${PORT}/configure`));
