/**
 * Tailwind preset for the kit. Every color / radius / shadow resolves to a CSS variable defined in styles/kit.css,
 * so themes and accent changes need zero component edits.
 *
 *   // tailwind.config.js
 *   import kit from './src/ui-kit/tailwind-preset.js';
 *   export default { presets: [kit], content: ['./index.html', './src/**\/*.{js,jsx}'] };
 */
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  // Card tones are chosen at run time (tone-purple, tone-teal...), so Tailwind cannot see them in the source.
  safelist: [{ pattern: /^tone-(accent|purple|blue|teal|orange|red|green)$/ }],
  theme: {
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      white: '#fff',
      ink: token('ink'),
      'sem-blue': token('sem-blue'),
      'sem-purple': token('sem-purple'),
      'sem-teal': token('sem-teal'),
      'sem-orange': token('sem-orange'),
      'sem-red': token('sem-red'),
      'risk-normal': token('risk-normal'),
      'risk-watch': token('risk-watch'),
      'risk-elevated': token('risk-elevated'),
      'risk-review': token('risk-review'),
      'tone-peach': token('tone-peach'),
      'tone-mint': token('tone-mint'),
      'tone-sky': token('tone-sky'),
      'tone-lilac': token('tone-lilac'),
      'tone-butter': token('tone-butter'),
      bg: token('bg'),
      surface: token('surface'),
      'surface-2': token('surface-2'),
      line: token('line'),
      fg: token('fg'),
      'fg-2': token('fg-2'),
      'fg-3': token('fg-3'),
      accent: token('accent'),
      'accent-text': token('accent-text'),
      'accent-fg': token('accent-fg'),
      'accent-deep': token('accent-deep'),
      'accent-2': token('accent-2'),
      success: token('success'),
      warning: token('warning'),
      danger: token('danger'),
      'danger-fg': token('danger-fg'),
    },
    borderRadius: {
      none: '0',
      sm: 'var(--radius-sm)',
      DEFAULT: 'var(--radius-md)',
      md: 'var(--radius-md)',
      lg: 'var(--radius-lg)',
      xl: 'var(--radius-xl)',
      full: '9999px',
    },
    boxShadow: {
      none: 'none',
      sm: 'var(--shadow-sm)',
      md: 'var(--shadow-md)',
      pop: 'var(--shadow-pop)',
    },
    zIndex: {
      0: '0',
      10: '10',
      nav: 'var(--z-nav)',
      overlay: 'var(--z-overlay)',
      modal: 'var(--z-modal)',
      toast: 'var(--z-toast)',
      tooltip: 'var(--z-tooltip)',
    },
    transitionDuration: { DEFAULT: 'var(--dur)', fast: 'var(--dur-fast)', slow: '300ms' },
    transitionTimingFunction: { DEFAULT: 'var(--ease)' },
    fontFamily: {
      // Each family reads a CSS variable first, so a font can be swapped at runtime (see playground/fontOptions.js) or from your own CSS:
      //   :root { --font-sans: 'Inter Variable'; --font-display: 'Bricolage Grotesque Variable'; --font-mono: 'JetBrains Mono Variable'; }
      display: ['var(--font-display, Anton)', 'Impact', 'Haettenschweiler', 'sans-serif'],
      sans: ['var(--font-sans, "Geist Variable")', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      mono: ['var(--font-mono, "Geist Mono Variable")', 'ui-monospace', 'SFMono-Regular', 'monospace'],
    },
    extend: {
      maxWidth: { content: 'var(--w-content)', prose: 'var(--w-prose)' },
    },
  },
  plugins: [],
};
