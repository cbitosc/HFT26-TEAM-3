const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Splits `text` into [{ text, match }] segments for the words in `query` (case-insensitive). Pure, so it is easy to test. */
export function highlightParts(text, query) {
  const str = String(text ?? '');
  const terms = [...new Set((query || '').trim().split(/\s+/).filter(Boolean))].sort((a, b) => b.length - a.length);
  if (!terms.length) return [{ text: str, match: false }];
  const re = new RegExp(`(${terms.map(escapeRe).join('|')})`, 'ig');
  return str.split(re).map((part, i) => ({ text: part, match: i % 2 === 1 })).filter((p) => p.text);
}

