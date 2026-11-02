import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { themes as defaultThemes } from '../config/themes';
import { deriveAccent, parseHex } from '../utils/color';

const ThemeContext = createContext(null);

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Reads { theme, accent } from localStorage. Never throws: missing, corrupt, or blocked storage all yield {}. */
function readStored(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '{}');
    return isPlainObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

const knownTheme = (themes, id) => (typeof id === 'string' && themes.some((t) => t.id === id) ? id : null);
const validAccent = (value) => (value && parseHex(value) ? value : null);

/** Writes the theme (and an optional accent override) onto <html>. Colors live in styles/kit.css under [data-theme]. */
function applyTheme(themes, theme, accent) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  const derived = accent && deriveAccent(accent, themes.find((t) => t.id === theme)?.dark);
  if (!derived) {
    ['--accent', '--accent-text', '--accent-fg', '--accent-deep'].forEach((v) => root.style.removeProperty(v));
    return;
  }
  root.style.setProperty('--accent', derived.accent.join(' '));
  root.style.setProperty('--accent-text', derived.accentText.join(' '));
  root.style.setProperty('--accent-fg', derived.accentFg.join(' '));
  root.style.setProperty('--accent-deep', derived.accentDeep.join(' '));
}

/**
 * Theme + accent state, remembered in localStorage.
 *   <ThemeProvider defaultTheme="forest" storageKey="my-app.theme">…</ThemeProvider>
 * Pass `themes` to replace the preset list (each: { id, label, dark?, swatch? }; define matching [data-theme] blocks in your CSS).
 * Saved values are validated: an unknown theme id or a malformed accent falls back to the defaults instead of being applied.
 * `setAccent(null)` clears the override.
 */
export function ThemeProvider({ children, defaultTheme = 'forest', defaultAccent = null, storageKey = 'ui-kit.theme', themes = defaultThemes }) {
  const [theme, setThemeState] = useState(() => {
    const stored = readStored(storageKey);
    return knownTheme(themes, stored.theme) || knownTheme(themes, defaultTheme) || themes[0]?.id;
  });
  const [accent, setAccentState] = useState(() => {
    const stored = readStored(storageKey);
    return 'accent' in stored ? validAccent(stored.accent) : validAccent(defaultAccent);
  });

  useEffect(() => {
    applyTheme(themes, theme, accent);
    try {
      localStorage.setItem(storageKey, JSON.stringify({ theme, accent }));
    } catch {
      /* storage unavailable: the theme still applies for this session */
    }
  }, [theme, accent, storageKey, themes]);

  const setTheme = useCallback((id) => {
    const ok = knownTheme(themes, id);
    if (ok) setThemeState(ok);
    else if (typeof console !== 'undefined') console.warn(`[ui-kit] Unknown theme "${id}". Available: ${themes.map((t) => t.id).join(', ')}`);
  }, [themes]);
  const setAccent = useCallback((value) => {
    if (value == null || value === '') setAccentState(null);
    else if (parseHex(value)) setAccentState(value);
    else if (typeof console !== 'undefined') console.warn(`[ui-kit] Ignored invalid accent "${value}". Use a hex colour such as #E11D48.`);
  }, []);

  const value = useMemo(() => ({ theme, accent, setTheme, setAccent, themes }), [theme, accent, setTheme, setAccent, themes]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme() must be used inside <ThemeProvider>. Wrap your app: <ThemeProvider><App /></ThemeProvider>.');
  return ctx;
}
