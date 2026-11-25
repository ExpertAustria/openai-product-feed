// Minimaler, abhängigkeitsfreier Parser für Google-Merchant-Atom-Feeds (g:-Namespace).
// Bewusst ohne npm-Pakete: kleinere Angriffsfläche, kein "npm install" in der Action.

const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

export function decode(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e) => {
    if (e[0] === "#") {
      const cp = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try {
        return String.fromCodePoint(cp);
      } catch {
        return "";
      }
    }
    return NAMED[e.toLowerCase()];
  });
}

function text(raw) {
  const m = raw.match(/^\s*<!\[CDATA\[([\s\S]*)\]\]>\s*$/);
  return m ? m[1] : decode(raw);
}

// Sammelt alle flachen <g:name>wert</g:name>-Tags; mehrfach vorkommende Tags ergeben mehrere Werte.
function collect(xml) {
  const out = {};
  const re = /<g:([a-z0-9_]+)>([\s\S]*?)<\/g:\1>/gi;
  let m;
  while ((m = re.exec(xml))) {
    const key = m[1].toLowerCase();
    (out[key] ||= []).push(text(m[2]));
  }
  return out;
}

export function parseEntry(body) {
  const shipping = [];
  const rest = body.replace(/<g:shipping>([\s\S]*?)<\/g:shipping>/gi, (_, inner) => {
    const c = collect(inner);
    shipping.push(Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v[0]])));
    return "";
  });
  return { fields: collect(rest), shipping };
}

export function* entries(xml) {
  const re = /<entry>([\s\S]*?)<\/entry>/g;
  let m;
  while ((m = re.exec(xml))) yield parseEntry(m[1]);
}
