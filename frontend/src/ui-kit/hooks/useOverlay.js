import { useEffect, useRef } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

// Initial focus: an element marked data-autofocus, else the first text field (so typing works at once), else the first focusable thing.
const FIELD = 'input:not([disabled]):not([type="hidden"]):not([type="checkbox"]):not([type="radio"]),textarea:not([disabled]),select:not([disabled])';

const visible = (el) => el.getClientRects().length > 0;

/**
 * Shared behaviour for Modal / Drawer / CommandPalette:
 * Esc to close, scroll lock, focus trap, and focus restore on close.
 * `onClose` may be an inline arrow: it is read through a ref so a parent re-render never re-runs the effect
 * (which would steal focus back to the first control while the user is typing).
 */
export function useOverlay(open, onClose) {
  const panelRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const previouslyFocused = document.activeElement;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    const panel = panelRef.current;
    const first = panel?.querySelector('[data-autofocus]') || panel?.querySelector(FIELD) || panel?.querySelector(FOCUSABLE) || panel;
    first?.focus({ preventScroll: true });

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current?.();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const nodes = [...panel.querySelectorAll(FOCUSABLE)].filter(visible);
      if (!nodes.length) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const [a, z] = [nodes[0], nodes[nodes.length - 1]];
      const active = document.activeElement;
      if (e.shiftKey && (active === a || active === panel)) {
        e.preventDefault();
        z.focus();
      } else if (!e.shiftKey && active === z) {
        e.preventDefault();
        a.focus();
      } else if (!panel.contains(active)) {
        e.preventDefault();
        a.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = overflow;
      if (previouslyFocused?.isConnected) previouslyFocused.focus?.({ preventScroll: true });
    };
  }, [open]);

  return panelRef;
}
