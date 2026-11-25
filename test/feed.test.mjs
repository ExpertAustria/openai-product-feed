import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildFeed } from "../src/build.mjs";
import { money, gtinValid, cleanText } from "../src/map.mjs";

const cfg = {
  sellerName: "Testshop",
  targetCountries: ["AT"],
  storeCountry: "AT",
  shippingCountry: "AT",
};

const xml = await readFile(new URL("./fixtures/sample.xml", import.meta.url), "utf8");
const { lines, report } = buildFeed(xml, cfg);
const rows = Object.fromEntries(lines.map((l) => JSON.parse(l)).map((r) => [r.item_id, r]));

test("Zählung: 6 gelesen, 3 geschrieben, 3 übersprungen", () => {
  assert.equal(report.eingelesen, 6);
  assert.equal(report.geschrieben, 3);
  assert.equal(report.uebersprungen, 3);
});

test("Grundmapping, Pflichtfelder und Bereinigung", () => {
  const r = rows["1001"];
  assert.equal(r.title, "Duracell Lithium 1/3 N Photo Knopfzelle & Co");
  assert.equal(r.description, "Produkteigenschaften:: Verwendbar für Taschenrechner;");
  assert.equal(r.url, "https://shop.example/p1001");
  assert.equal(r.image_url, "https://shop.example/img/1001.jpeg");
  assert.equal(r.seller_name, "Testshop");
  assert.equal(r.availability, "in_stock");
  assert.equal(r.price, "7.99 EUR");
  assert.equal(r.gtin, "5000394003323");
  assert.equal(r.mpn, "5000496");
  assert.equal(r.shipping_price, "6.95 EUR");
  assert.deepEqual(r.target_countries, ["AT"]);
  assert.equal(r.store_country, "AT");
  assert.equal(
    r.product_category,
    "Haustechnik & Beleuchtung > Batterien & Akkus > Knopfzellen",
  );
  assert.equal("color" in r, false, "leere Felder dürfen nicht ausgegeben werden");
  assert.equal("group_id" in r, false);
});

test("leere Beschreibung -> Titel, Komma-Preis, Sale-Preis, ungültige GTIN entfällt", () => {
  const r = rows["1002"];
  assert.equal(r.description, "Artikel ohne Beschreibung");
  assert.equal(r.price, "19.90 EUR");
  assert.equal(r.sale_price, "14.90 EUR");
  assert.equal(r.availability, "out_of_stock");
  assert.equal("gtin" in r, false);
  assert.ok(report.hinweise.gtin_ungueltig_ausgelassen);
  assert.ok(report.hinweise.beschreibung_leer_titel_verwendet);
});

test("Variante: group_id, listing_has_variations, variant_dict, Zusatzbilder", () => {
  const r = rows["1004"];
  assert.equal(r.availability, "pre_order");
  assert.equal(r.group_id, "TRAIL");
  assert.equal(r.listing_has_variations, true);
  assert.deepEqual(r.variant_dict, { color: "Schwarz", size: "10" });
  assert.equal(r.additional_image_urls.length, 2);
});

test("Zeilen mit Fehlern werden übersprungen und gemeldet", () => {
  assert.ok(report.gruende_uebersprungen.verfuegbarkeit_unbekannt);
  assert.ok(report.gruende_uebersprungen.bild_ungueltig);
  assert.ok(report.gruende_uebersprungen.item_id_doppelt);
  assert.equal(rows["1003"], undefined);
  assert.equal(rows["1005"], undefined);
});

test("money()", () => {
  assert.equal(money("79.99 EUR"), "79.99 EUR");
  assert.equal(money("7,5 eur"), "7.50 EUR");
  assert.equal(money("0.00 EUR"), null);
  assert.equal(money("abc"), null);
  assert.equal(money("1.299,00 EUR"), null);
});

test("gtinValid()", () => {
  assert.equal(gtinValid("5000394003323"), true);
  assert.equal(gtinValid("4006381333931"), true);
  assert.equal(gtinValid("1234567890123"), false);
  assert.equal(gtinValid("123"), false);
});

test("cleanText()", () => {
  assert.equal(cleanText("  a \n\n\t b<br>c "), "a b c");
});
