# openai-product-feed

Wandelt den Google-Merchant-Center-Feed (Atom/XML) in das OpenAI-Produktfeed-Format (JSONL) um
und veröffentlicht ihn per GitHub Pages unter einer festen URL. Diese URL wird im OpenAI Business Hub
als „hosted URL“ eingetragen.

Spec: <https://developers.openai.com/commerce/specs/file-upload/products>

**Dieses Repo ist öffentlich gedacht.** Es enthält keine Zugangsdaten. Alles Konfigurierbare steht in
GitHub *Variables* (nicht Secrets), weil weder Feed-URL noch Händlername geheim sind. Niemals Schlüssel
oder `.env`-Dateien committen.

## Einrichtung (einmalig)
1. Öffentliches GitHub-Repo anlegen und pushen.
2. *Settings → Pages → Source: GitHub Actions*.
3. *Settings → Secrets and variables → Actions → Variables*:
   - `MERCHANT_FEED_URL` = `https://api.expert.at/export/product-feed/product_feed_sales_price.xml`
   - `SELLER_NAME` = `expert` (Händlername im Feed, Pflicht)
   - optional `TARGET_COUNTRIES` (Default `AT`), `STORE_COUNTRY` (Default `AT`)
   - optional `FEED_DOMAIN` = z. B. `feeds.ihrshop.at`
4. Eigene Domain: *Settings → Pages → Custom domain* eintragen, beim Domain-Anbieter einen
   **CNAME** `feeds` → `<github-konto>.github.io` setzen, danach „Enforce HTTPS“ aktivieren.
5. *Actions → OpenAI-Feed bauen und veröffentlichen → Run workflow*.

Feed-URL danach: `https://<domain>/openai_feed.jsonl.gz`

Hinweis: Das OpenAI Business Hub verlangt JSONL **gzip-komprimiert** (`.jsonl.gz`, UTF-8, ein Produkt pro Zeile).
Unkomprimiertes `.jsonl` wird abgelehnt.

## Lokal testen
```bash
npm test
INPUT_FILE=test/fixtures/sample.xml SELLER_NAME="Testshop" node build-feed.mjs
```

## Schutz vor kaputten Feeds
Der Build bricht ab und veröffentlicht **nichts**, wenn der Merchant-Feed nicht ladbar ist, keine Produkte
enthält oder mehr als `MAX_SKIP_RATIO` (Default 20 %) der Zeilen übersprungen werden müssten. Die letzte
gute Version bleibt dann online. Details stehen im Artefakt `feed-report` (nicht öffentlich).

## Mapping
Siehe `src/map.mjs`. Wichtigste Regeln: `id→item_id`, `link→url`, `image_link→image_url`,
Verfügbarkeit nach `in_stock|out_of_stock|pre_order|backorder`, Preise als `79.99 EUR`,
leere Beschreibung → Titel, ungültige GTIN wird ausgelassen, Versandkosten nur fürs Zielland.

## Offen
- Die öffentliche Spec nennt für den Standard-Upload nur **US** (weitere Märkte nach Bestätigung durch OpenAI).
  Laut Betreiber wird AT angeboten; beim ersten Upload im Business Hub auf Meldungen zu
  `target_countries`/`store_country` und EUR achten.
