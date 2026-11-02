import { useEffect } from 'react';

/**
 * Global keyboard shortcut. `combo` like 'mod+k' (mod = Cmd on macOS, Ctrl elsewhere).
 */
export function useHotkey(combo, handler, { enabled = true } = {}) {
  useEffect(() => {
    if (!enabled) return undefined;
    const parts = combo.toLowerCase().split('+');
    const key = parts[parts.length - 1];
    const wantsMod = parts.includes('mod');
    const wantsShift = parts.includes('shift');

    const onKeyDown = (e) => {
      if (e.key.toLowerCase() !== key) return;
      if (wantsMod !== (e.metaKey || e.ctrlKey)) return;
      if (wantsShift !== e.shiftKey) return;
      e.preventDefault();
      handler(e);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [combo, handler, enabled]);
}
