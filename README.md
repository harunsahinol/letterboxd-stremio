# Letterboxd Watchlist → Stremio

Herhangi bir **herkese açık** Letterboxd watchlist'ini Stremio'da katalog olarak gösteren, çok kullanıcılı, ücretsiz barındırılabilen eklenti.

- Hesap, veritabanı, API anahtarı yok. Her kullanıcının ayarı kendi kurulum adresinin içinde saklanır.
- Birden fazla kullanıcı adı girilebilir (arkadaşlarının watchlist'leri ayrı kataloglar olarak gelir).
- Filmler IMDb ID'leriyle döner, yani Cinemeta ve kurulu tüm stream eklentileri doğrudan çalışır.
- Sıralama: son eklenen, ilk eklenen, isim, çıkış yılı (yeni/eski), günlük karışık. Stremio Keşfet ekranındaki menüden de değiştirilebilir.

## Mimari

```
Kullanıcı ──► /configure  (kullanıcı adı + sıralama seçer)
                │
                ▼
   https://SUNUCU/<base64url ayar>/manifest.json   ◄── Stremio bunu yükler
                │
   Stremio ──► /<ayar>/catalog/movie/lbxd-watchlist-<kullanıcı>.json?skip=..
                │
                ├─ letterboxd.com/<kullanıcı>/watchlist/page/N/   (tüm sayfalar, 15 dk önbellek)
                └─ letterboxd.com/film/<slug>/                    (IMDb/TMDB ID + poster, 30 gün önbellek)
```

- **Durumsuz (stateless):** Sunucu kimseyi saklamaz; ayar URL'de. Bu yüzden tek bir ücretsiz sunucu herkese hizmet verebilir.
- **Önbellek:** Bellek içi LRU + Netlify CDN önbelleği (`Netlify-CDN-Cache-Control: durable`). Aynı katalog isteği tüm kenar sunucularda önbellekten döner, fonksiyon hiç çalışmaz. Bir film bir kez çözüldüğünde tüm kullanıcılar için hazırdır; popüler filmler neredeyse hiç Letterboxd'a tekrar istek atmaz.
- **Kademeli çözümleme:** Her istekte en fazla N film sayfası çekilir; çözülemeyenler `lbxd:<slug>` ID'siyle döner ve eklentinin kendi `meta` uç noktası bunları açınca çözer (`defaultVideoId` ile stream eklentilerine IMDb ID'si iletilir). Arka planda sonraki sayfalar ısıtılır.
- **Sıralama yerel:** Letterboxd'un `/by/release/` gibi sıralı adresleri Cloudflare tarafından botlara kapalı, o yüzden liste bir kez çekilip eklenti içinde sıralanıyor.

| Dosya | Görev |
|---|---|
| `src/addon.js` | Platformdan bağımsız çekirdek: manifest, catalog, meta, yönlendirme |
| `src/letterboxd.js` | Watchlist ve film sayfası ayrıştırma |
| `src/cache.js` | Bellek + (Workers'ta) Cache API önbelleği |
| `src/configure.js` | Kurulum sayfası (TR/EN otomatik) |
| `src/server.js` | Node sunucusu (yerel, Render, Koyeb, Docker…) |
| `netlify/functions/addon.js` + `netlify.toml` | Netlify |
| `src/worker.js` + `wrangler.toml` | Cloudflare Workers (deneysel) |

## Yerelde çalıştırma

```bash
npm install
```

```bash
npm start
```

Sonra `http://localhost:7001/configure` adresini aç. Canlı Letterboxd'a karşı hızlı test:

```bash
npm test -- kullanici_adin
```

> Stremio masaüstü uygulaması `http://localhost` eklentilerini kabul eder; telefondan / TV'den kullanmak için HTTPS ile yayınlaman gerekir (aşağıda).

## Ücretsiz yayınlama (herkes kullansın diye)

### 1) Netlify (önerilen — ücretsiz plan, uyumaz, HTTPS dahil)

1. Bu klasörü bir GitHub deposuna yükle.
2. [app.netlify.com](https://app.netlify.com) → **Add new site → Import an existing project** → GitHub → depoyu seç.
3. Ayarlar `netlify.toml`'dan otomatik okunur (build komutu yok, fonksiyon klasörü `netlify/functions`). **Deploy**'a bas.
4. `https://<site-adi>.netlify.app/configure` adresini paylaş. Bu kadar.

CLI ile (GitHub olmadan):

```bash
npx netlify-cli login
```

```bash
npx netlify-cli deploy --prod
```

Notlar:
- Netlify'ın ücretsiz planında fonksiyonlar en fazla 10 sn çalışabiliyor. Eklenti bu yüzden ~6 sn sonra yeni film sayfası çekmeyi bırakıp elindekini döndürüyor; kalanlar arka planda ve sonraki istekte tamamlanıyor.
- Ücretsiz planın aylık bir kullanım kotası var. CDN önbelleği isteklerin çoğunu fonksiyona hiç uğratmadan karşıladığı için normal kullanımda bu kotaya yaklaşmak zor; kendi panelinden takip edebilirsin.

### 2) Render / Koyeb / Railway (Node veya Docker)

- **Build:** `npm install` · **Start:** `npm start` (ya da hazır `Dockerfile`).
- Render'ın ücretsiz planı 15 dk hareketsizlikten sonra uyur; ilk istek ~30 sn sürebilir ve Stremio bu sırada zaman aşımına düşebilir. Ücretsiz bir uptime servisiyle (ör. UptimeRobot) `/manifest.json`'a 10 dakikada bir istek atarak uyanık tutabilirsin.

### 3) Cloudflare Workers (deneysel)

```bash
npx wrangler deploy
```

Ücretsiz planda istek başına 50 alt-istek sınırı olduğu için büyük watchlist'ler birkaç yenilemede tamamlanır. Ayrıca Letterboxd, Cloudflare IP'lerinden gelen istekleri zaman zaman engelleyebilir; sorun yaşarsan Netlify'ı kullan.

## Sınırlar ve notlar

- Watchlist **herkese açık** olmalı. Gizli listeler okunamaz (Letterboxd'un resmî API'si genel kullanıma kapalı).
- Letterboxd'da IMDb bağlantısı olmayan nadir filmler `lbxd:` ID'siyle görünür; açınca Letterboxd bilgileri gösterilir ama stream bulunamayabilir.
- Letterboxd HTML yapısını değiştirirse `src/letterboxd.js` içindeki `parseWatchlistPage` / `parseFilmPage` güncellenmelidir (eski ve yeni poster işaretlemesi destekleniyor).
- Letterboxd veya Stremio ile bağlantılı değildir. Letterboxd'u yormamak için önbellek süreleri bilerek uzun tutuldu.

## Lisans

MIT
