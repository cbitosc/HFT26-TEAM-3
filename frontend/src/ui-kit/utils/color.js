/** Small, dependency-free colour helpers used by the theme provider. Everything here is pure so it can be unit-tested. */

/** Parses '#rgb', '#rrggbb' (leading # optional) into [r, g, b]. Returns null for anything else, never NaN. */
export function parseHex(input) {
  if (typeof input !== 'string') return null;
  let h = input.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(h)) h = [...h].map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(h)) return null;
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const mix = (rgb, target, amount) => rgb.map((c, i) => Math.round(c + (target[i] - c) * amount));

const channel = (c) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

/** WCAG relative luminance of an [r, g, b] triplet. */
export const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);

/** WCAG contrast ratio between two [r, g, b] triplets (1 to 21). */
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const WHITE = [255, 255, 255];
const INK = [9, 10, 12];

/**
 * Derives everything an accent needs from one colour:
 *   accent      the colour itself (button fills, rings)
 *   accentFg    text on top of a filled accent: white or near-black, whichever has more contrast
 *   accentText  accent used as text/links on the page surface: lightened on dark themes, darkened on light ones
 *   accentDeep  end colour of accent gradients: darker when the label is white, lighter when it is near-black, so the label stays readable
 * Returns null when `hex` is not a valid colour.
 */
export function deriveAccent(hex, isDark) {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  const accentFg = contrast(rgb, WHITE) >= contrast(rgb, INK) ? WHITE : INK;
  const accentText = isDark ? mix(rgb, WHITE, 0.4) : mix(rgb, [0, 0, 0], 0.15);
  const accentDeep = accentFg === WHITE ? mix(rgb, [0, 0, 0], 0.35) : mix(rgb, WHITE, 0.3);
  return { accent: rgb, accentFg, accentText, accentDeep };
}
