/**
 * Theme presets. The actual color values live in styles/kit.css under
 * [data-theme="..."]; this file only lists them for the UI.
 * `dark: true` marks themes with dark surfaces (used to derive a readable accent-text).
 */
export const themes = [
  { id: 'ember', label: 'TraceLine Ember', description: 'Warm black, signal orange', dark: true, swatch: ['#100D0B', '#191410', '#FF692C'] },
  { id: 'forest', label: 'Forest Light', description: 'Soft, airy, deep green', swatch: ['#EBEEEC', '#FFFFFF', '#1F6B42'] },
  { id: 'paper', label: 'Paper Ink', description: 'Warm beige, hard black edges, blue and magenta', swatch: ['#EDE8E0', '#FFFFFF', '#0073E6'] },
  { id: 'dark', label: 'Graphite', description: 'Near-black, signal cyan', dark: true, swatch: ['#08090B', '#15181C', '#22D3EE'] },
  { id: 'blue', label: 'Blue + Dark', description: 'Deep navy, electric blue', dark: true, swatch: ['#070A10', '#111827', '#2563EB'] },
  { id: 'warm', label: 'Warm Human-Centered', description: 'Soft, approachable', swatch: ['#FAF7F2', '#FFFDF9', '#C2410C'] },
];

export const accentPresets = [
  { id: 'ink-blue', label: 'Ink blue', value: '#0073E6' },
  { id: 'forest', label: 'Forest', value: '#1F6B42' },
  { id: 'cyan', label: 'Cyan', value: '#22D3EE' },
  { id: 'violet', label: 'Violet', value: '#7C3AED' },
  { id: 'indigo', label: 'Indigo', value: '#4F46E5' },
  { id: 'blue', label: 'Blue', value: '#2563EB' },
  { id: 'teal', label: 'Teal', value: '#0D9488' },
  { id: 'emerald', label: 'Emerald', value: '#059669' },
  { id: 'rose', label: 'Rose', value: '#E11D48' },
  { id: 'orange', label: 'Orange', value: '#C2410C' },
];
