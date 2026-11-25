#!/usr/bin/env node
// Merchant-Center-Feed (Atom/XML) -> OpenAI-Produktfeed (JSONL)
//
// Konfiguration per Umgebungsvariablen (siehe .env.example):
//   MERCHANT_FEED_URL  URL des Merchant-Feeds   (oder INPUT_FILE für eine lokale Datei)
//   SELLER_NAME        Pflicht, erscheint im Feed als seller_name
//   TARGET_COUNTRIES   Default "AT" (kommagetrennt)
//   STORE_COUNTRY      Default "AT"
//   OUT_DIR            Default "out"  (wird veröffentlicht)
//   REPORT_DIR         Default "report" (wird NICHT veröffentlicht)
//   MAX_SKIP_RATIO     Default 0.2   (mehr übersprungene Zeilen => Abbruch, nichts wird veröffentlicht)
//   FEED_DOMAIN        optional, schreibt eine CNAME-Datei für GitHub Pages

import { readFile, writeFile, mkdir, appendFile } from "node:fs/promises";
import { join } from "node:path";
import { buildFeed } from "./src/build.mjs";

const env = process.env;
const fail = (msg) => {
  console.error(`FEHLER: ${msg}`);
  process.exit(1);
};

const sellerName = (env.SELLER_NAME || "").trim();
if (!sellerName) fail("SELLER_NAME ist nicht gesetzt.");

const targetCountries = (env.TARGET_COUNTRIES || "AT")
  .split(",")
  .map((c) => c.trim().toUpperCase())
  .filter(Boolean);
const storeCountry = (env.STORE_COUNTRY || "AT").trim().toUpperCase();
const cfg = {
  sellerName,
  targetCountries,
  storeCountry,
  shippingCountry: targetCountries[0],
};

const outDir = env.OUT_DIR || "out";
const reportDir = env.REPORT_DIR || "report";
const maxSkip = Number(env.MAX_SKIP_RATIO ?? 0.2);

async function load() {
  if (env.INPUT_FILE) return readFile(env.INPUT_FILE, "utf8");
  const url = env.MERCHANT_FEED_URL;
  if (!url) fail("MERCHANT_FEED_URL oder INPUT_FILE setzen.");
  if (!/^https:\/\//i.test(url)) fail("MERCHANT_FEED_URL muss mit https:// beginnen.");
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      lastErr = e;
      console.warn(`Download-Versuch ${attempt}/3 fehlgeschlagen: ${e.message}`);
      await new Promise((r) => setTimeout(r, 3000 * attempt));
    }
  }
  fail(`Merchant-Feed konnte nicht geladen werden: ${lastErr?.message}`);
}

const xml = await load();
const { lines, report } = buildFeed(xml, cfg);

await mkdir(reportDir, { recursive: true });
await writeFile(join(reportDir, "report.json"), JSON.stringify(report, null, 2));

const summary =
  `Eingelesen: ${report.eingelesen} | geschrieben: ${report.geschrieben} | ` +
  `übersprungen: ${report.uebersprungen} (${(report.uebersprungen_quote * 100).toFixed(1)} %)`;
console.log(summary);
if (env.GITHUB_STEP_SUMMARY) {
  await appendFile(
    env.GITHUB_STEP_SUMMARY,
    `### OpenAI-Feed\n${summary}\n\n\`\`\`json\n${JSON.stringify(
      { gruende: report.gruende_uebersprungen, hinweise: report.hinweise },
      null,
      2,
    )}\n\`\`\`\n`,
  );
}

if (report.eingelesen === 0) fail("Im Merchant-Feed wurden keine <entry>-Einträge gefunden.");
if (report.geschrieben === 0) fail("Kein einziges Produkt konnte umgewandelt werden.");
if (report.uebersprungen_quote > maxSkip) {
  fail(
    `Zu viele übersprungene Produkte (${(report.uebersprungen_quote * 100).toFixed(1)} % > ${maxSkip * 100} %). ` +
      "Nichts wird veröffentlicht. Details in report/report.json.",
  );
}

await mkdir(outDir, { recursive: true });
await writeFile(join(outDir, "openai_feed.jsonl"), lines.join("\n") + "\n");
await writeFile(join(outDir, ".nojekyll"), "");
if (env.FEED_DOMAIN) await writeFile(join(outDir, "CNAME"), env.FEED_DOMAIN.trim() + "\n");
console.log(`Geschrieben: ${join(outDir, "openai_feed.jsonl")}`);
