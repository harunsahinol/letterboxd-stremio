// Configuration / install page (English + Turkish, picked from the browser language).

export function configurePage(origin, cfg, sorts) {
  const initial = JSON.stringify({ users: cfg ? cfg.users.join(", ") : "", sort: cfg ? cfg.sort : "added" });
  const sortOptions = Object.entries(sorts)
    .map(([k, v]) => `<option value="${k}">${v}</option>`)
    .join("");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Letterboxd Watchlist for Stremio</title>
<style>
  :root { --bg:#14181c; --card:#1c2228; --line:#2c3440; --text:#e1e8f0; --muted:#8a9bab;
          --green:#00e054; --orange:#ff8000; --blue:#40bcf4; }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100vh; background:var(--bg); color:var(--text);
         font:16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
         display:flex; align-items:center; justify-content:center; padding:24px 16px 96px; }
  main { width:100%; max-width:460px; background:var(--card); border:1px solid var(--line);
         border-radius:14px; padding:28px; }
  .dots { display:flex; gap:6px; margin-bottom:14px; }
  .dots i { width:14px; height:14px; border-radius:50%; display:block; }
  h1 { font-size:22px; margin:0 0 6px; }
  p.sub { color:var(--muted); margin:0 0 22px; font-size:14px; }
  label { display:block; font-size:13px; color:var(--muted); margin:16px 0 6px; }
  input, select { width:100%; padding:11px 12px; border-radius:8px; border:1px solid var(--line);
                  background:#0f1317; color:var(--text); font-size:15px; }
  input:focus, select:focus { outline:2px solid var(--blue); outline-offset:0; border-color:transparent; }
  .hint { font-size:12px; color:var(--muted); margin-top:6px; }
  .status { font-size:13px; margin-top:8px; min-height:20px; }
  .ok { color:var(--green); } .err { color:#ff6b6b; }
  .btns { display:grid; gap:10px; margin-top:22px; }
  button, a.btn { display:block; text-align:center; padding:12px; border-radius:8px; border:0;
                  font-size:15px; font-weight:600; cursor:pointer; text-decoration:none; }
  .primary { background:var(--green); color:#0b1a10; }
  .secondary { background:transparent; color:var(--text); border:1px solid var(--line) !important; }
  .disabled { opacity:.45; pointer-events:none; }
  code { display:block; word-break:break-all; font-size:12px; color:var(--muted); background:#0f1317;
         padding:10px; border-radius:8px; margin-top:12px; border:1px solid var(--line); }
  footer { margin-top:20px; font-size:12px; color:var(--muted); text-align:center; }
  footer a { color:var(--muted); }
</style>
</head>
<body>
<main>
  <div class="dots"><i style="background:var(--orange)"></i><i style="background:var(--green)"></i><i style="background:var(--blue)"></i></div>
  <h1 data-t="title">Letterboxd Watchlist for Stremio</h1>
  <p class="sub" data-t="sub">Show any public Letterboxd watchlist as a catalog in Stremio. Free, no account needed.</p>

  <label for="users" data-t="userLabel">Letterboxd username(s)</label>
  <input id="users" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="e.g. dave">
  <div class="hint" data-t="userHint">Separate several with commas to add friends' watchlists too. The watchlist must be public.</div>
  <div class="status" id="status" aria-live="polite"></div>

  <label for="sort" data-t="sortLabel">Default order</label>
  <select id="sort">${sortOptions}</select>
  <div class="hint" data-t="sortHint">You can also change the order from the dropdown in Stremio's Discover page.</div>

  <div class="btns">
    <a class="btn primary disabled" id="install" data-t="install">Install in Stremio</a>
    <a class="btn secondary disabled" id="web" target="_blank" rel="noopener" data-t="web">Install in Stremio Web</a>
    <button class="secondary disabled" id="copy" data-t="copy">Copy manifest URL</button>
  </div>
  <code id="url" hidden></code>
  <footer>
    <a href="https://github.com/harunsahinol/letterboxd-stremio" target="_blank" rel="noopener" data-t="source">Open source on GitHub</a>
    · <span data-t="footer">Not affiliated with Letterboxd or Stremio.</span>
  </footer>
</main>
<script>
const ORIGIN = ${JSON.stringify(origin)};
const INITIAL = ${initial};
const T = {
  tr: {
    title: "Stremio için Letterboxd Watchlist",
    sub: "Herhangi bir herkese açık Letterboxd watchlist'ini Stremio'da katalog olarak göster. Ücretsiz, hesap gerekmez.",
    userLabel: "Letterboxd kullanıcı ad(lar)ı",
    userHint: "Arkadaşlarının listelerini de eklemek için virgülle ayır. Watchlist herkese açık olmalı.",
    sortLabel: "Varsayılan sıralama",
    sortHint: "Sıralamayı Stremio'nun Keşfet sayfasındaki menüden de değiştirebilirsin.",
    install: "Stremio'ya yükle", web: "Stremio Web'e yükle", copy: "Manifest adresini kopyala",
    copied: "Kopyalandı!", checking: "Kontrol ediliyor…", found: (u, n) => u + ": " + n + " film bulundu",
    notfound: (u) => u + ": kullanıcı bulunamadı ya da watchlist gizli", upstream: (u) => u + ": Letterboxd'a şu an ulaşılamadı (yine de yükleyebilirsin)",
    invalid: (u) => u + ": geçersiz kullanıcı adı",
    footer: "Letterboxd veya Stremio ile bağlantılı değildir.",
    source: "GitHub'da açık kaynak"
  },
  en: {
    copied: "Copied!", checking: "Checking…", found: (u, n) => u + ": " + n + " films found",
    notfound: (u) => u + ": user not found or watchlist is private", upstream: (u) => u + ": couldn't reach Letterboxd right now (you can still install)",
    invalid: (u) => u + ": invalid username"
  }
};
const lang = (navigator.language || "en").toLowerCase().startsWith("tr") ? "tr" : "en";
const L = Object.assign({}, T.en, lang === "tr" ? T.tr : {});
if (lang === "tr") {
  document.documentElement.lang = "tr";
  document.querySelectorAll("[data-t]").forEach(el => { const v = L[el.dataset.t]; if (typeof v === "string") el.textContent = v; });
}

const $ = (id) => document.getElementById(id);
const usersEl = $("users"), sortEl = $("sort"), statusEl = $("status");
usersEl.value = INITIAL.users; sortEl.value = INITIAL.sort;

function users() {
  return usersEl.value.split(/[\\s,]+/).map(s => s.trim().toLowerCase()
    .replace(/^https?:\\/\\/(www\\.)?letterboxd\\.com\\//, "").replace(/\\/.*$/, "")).filter(Boolean);
}
function b64url(s) { return btoa(s).replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/, ""); }
function manifestUrl() {
  const u = users().filter(x => /^[a-z0-9_]{1,40}$/.test(x));
  if (!u.length) return null;
  return ORIGIN + "/" + b64url(JSON.stringify({ users: u, sort: sortEl.value })) + "/manifest.json";
}
function update() {
  const url = manifestUrl();
  ["install", "web", "copy"].forEach(id => $(id).classList.toggle("disabled", !url));
  $("url").hidden = !url;
  if (!url) return;
  $("url").textContent = url;
  $("install").href = url.replace(/^https?:\\/\\//, "stremio://");
  $("web").href = "https://web.stremio.com/#/addons?addon=" + encodeURIComponent(url);
}
let timer;
function check() {
  clearTimeout(timer);
  const list = users();
  if (!list.length) { statusEl.textContent = ""; return; }
  timer = setTimeout(async () => {
    statusEl.className = "status"; statusEl.textContent = L.checking;
    const lines = await Promise.all(list.map(async u => {
      if (!/^[a-z0-9_]{1,40}$/.test(u)) return ["err", L.invalid(u)];
      try {
        const r = await (await fetch(ORIGIN + "/api/check?u=" + encodeURIComponent(u))).json();
        return r.ok ? ["ok", L.found(u, r.count)] : ["err", (L[r.error] || L.upstream)(u)];
      } catch { return ["err", L.upstream(u)]; }
    }));
    statusEl.innerHTML = "";
    lines.forEach(([cls, text]) => { const d = document.createElement("div"); d.className = cls; d.textContent = text; statusEl.appendChild(d); });
  }, 600);
}
usersEl.addEventListener("input", () => { update(); check(); });
sortEl.addEventListener("change", update);
$("copy").addEventListener("click", async () => {
  const url = manifestUrl(); if (!url) return;
  try { await navigator.clipboard.writeText(url); } catch {}
  const b = $("copy"), old = b.textContent; b.textContent = L.copied; setTimeout(() => b.textContent = old, 1500);
});
update(); check();
</script>
</body>
</html>`;
}
