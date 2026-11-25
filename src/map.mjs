// Mapping Google Merchant Center -> OpenAI Product-Feed-Schema
// Spec: https://developers.openai.com/commerce/specs/file-upload/products

const AVAILABILITY = {
  "in stock": "in_stock",
  in_stock: "in_stock",
  "out of stock": "out_of_stock",
  out_of_stock: "out_of_stock",
  preorder: "pre_order",
  pre_order: "pre_order",
  "pre-order": "pre_order",
  backorder: "backorder",
};

const CONDITION = new Set(["new", "refurbished", "used"]);
const GENDER = new Set(["male", "female", "unisex"]);
const AGE_GROUP = new Set(["newborn", "infant", "toddler", "kids", "adult"]);

export function cleanText(s) {
  return String(s ?? "")
    .replace(/<\/?(?:br|p|li|ul|ol|div|tr|td|th|table|h[1-6])\b[^>]*>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/[   ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(s, max) {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

// "7.99 EUR" / "7,99 EUR" -> "7.99 EUR"; ungültig oder <= 0 -> null
export function money(s) {
  const m = String(s ?? "")
    .trim()
    .match(/^(\d+(?:[.,]\d{1,2})?)\s*([A-Za-z]{3})$/);
  if (!m) return null;
  const n = Number(m[1].replace(",", "."));
  if (!(n > 0)) return null;
  return `${n.toFixed(2)} ${m[2].toUpperCase()}`;
}

export function gtinValid(g) {
  if (!/^\d+$/.test(g) || ![8, 12, 13, 14].includes(g.length)) return false;
  const digits = g.split("").map(Number);
  const check = digits.pop();
  let sum = 0;
  for (let i = digits.length - 1, w = 3; i >= 0; i--, w = w === 3 ? 1 : 3) sum += digits[i] * w;
  return (10 - (sum % 10)) % 10 === check;
}

const isUrl = (u) => /^https?:\/\/\S+$/i.test(u);

export function mapEntry(entry, cfg) {
  const warnings = [];
  const first = (k) => {
    const v = (entry.fields[k] || []).map((x) => x.trim()).find((x) => x !== "");
    return v === undefined ? "" : v;
  };
  const skip = (reason) => ({ skip: reason, id: first("id"), warnings });

  const id = first("id");
  if (!id) return skip("id_fehlt");

  const title = truncate(cleanText(first("title")), 150);
  if (!title) return skip("titel_fehlt");

  const url = first("link");
  if (!isUrl(url)) return skip("link_ungueltig");

  const image = first("image_link");
  if (!isUrl(image)) return skip("bild_ungueltig");

  const brand = cleanText(first("brand"));
  if (!brand) return skip("marke_fehlt");

  const availability = AVAILABILITY[first("availability").toLowerCase()];
  if (!availability) return skip("verfuegbarkeit_unbekannt");

  const price = money(first("price"));
  if (!price) return skip("preis_ungueltig");

  let description = truncate(cleanText(first("description")), 5000);
  if (!description) {
    description = title; // Pflichtfeld: Fallback auf den Titel
    warnings.push("beschreibung_leer_titel_verwendet");
  }

  const row = {
    item_id: id,
    title,
    description,
    url,
    brand,
    seller_name: cfg.sellerName,
    image_url: image,
    availability,
    price,
  };

  const salePrice = money(first("sale_price"));
  if (salePrice) {
    const [pa, pc] = price.split(" ");
    const [sa, sc] = salePrice.split(" ");
    if (pc === sc && Number(sa) < Number(pa)) row.sale_price = salePrice;
    else warnings.push("sale_price_verworfen");
  }

  const gtin = first("gtin");
  if (gtin) {
    if (gtinValid(gtin)) row.gtin = gtin;
    else warnings.push("gtin_ungueltig_ausgelassen");
  }
  const mpn = first("mpn");
  if (mpn) row.mpn = mpn;

  const condition = first("condition").toLowerCase();
  if (CONDITION.has(condition)) row.condition = condition;

  const type = cleanText(first("product_type"));
  if (type) row.product_category = type.replace(/\s*>\s*/g, " > ");

  const color = cleanText(first("color"));
  const size = cleanText(first("size"));
  const material = cleanText(first("material"));
  if (color) row.color = color;
  if (size) row.size = size;
  if (material) row.material = material;
  const gender = first("gender").toLowerCase();
  if (GENDER.has(gender)) row.gender = gender;
  const age = first("age_group").toLowerCase();
  if (AGE_GROUP.has(age)) row.age_group = age;

  const group = first("item_group_id");
  if (group && group !== id) {
    const variant = {};
    if (color) variant.color = color;
    if (size) variant.size = size;
    if (Object.keys(variant).length) {
      row.group_id = group;
      row.listing_has_variations = true;
      row.variant_dict = variant;
    } else {
      warnings.push("gruppe_ohne_optionen_ausgelassen");
    }
  }

  const extra = (entry.fields.additional_image_link || [])
    .map((x) => x.trim())
    .filter(isUrl);
  if (extra.length) row.additional_image_urls = extra;

  // Versandkosten nur für das Zielland und nur bei gleicher Währung wie der Preis
  const ship = entry.shipping.find(
    (s) => (s.country || "").toUpperCase() === cfg.shippingCountry && money(s.price),
  );
  if (ship) {
    const sp = money(ship.price);
    if (sp.split(" ")[1] === price.split(" ")[1]) row.shipping_price = sp;
  }

  row.target_countries = cfg.targetCountries;
  row.store_country = cfg.storeCountry;

  return { row, id, warnings };
}
