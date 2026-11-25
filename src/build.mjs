import { entries } from "./xml.mjs";
import { mapEntry } from "./map.mjs";

const EXAMPLES = 5;

export function buildFeed(xml, cfg) {
  const lines = [];
  const seen = new Set();
  const skipped = {};
  const warned = {};
  let total = 0;

  const note = (bucket, key, id) => {
    const b = (bucket[key] ||= { count: 0, beispiele: [] });
    b.count++;
    if (b.beispiele.length < EXAMPLES) b.beispiele.push(id);
  };

  for (const entry of entries(xml)) {
    total++;
    const res = mapEntry(entry, cfg);
    for (const w of res.warnings) note(warned, w, res.id);
    if (res.skip) {
      note(skipped, res.skip, res.id);
      continue;
    }
    if (seen.has(res.row.item_id)) {
      note(skipped, "item_id_doppelt", res.row.item_id);
      continue;
    }
    seen.add(res.row.item_id);
    lines.push(JSON.stringify(res.row));
  }

  const skippedCount = total - lines.length;
  return {
    lines,
    report: {
      eingelesen: total,
      geschrieben: lines.length,
      uebersprungen: skippedCount,
      uebersprungen_quote: total ? skippedCount / total : 0,
      gruende_uebersprungen: skipped,
      hinweise: warned,
    },
  };
}
