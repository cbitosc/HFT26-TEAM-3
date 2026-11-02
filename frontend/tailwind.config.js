import kit from './src/ui-kit/tailwind-preset.js';
// The kit preset defines radii up to `xl` but its Topbar uses `rounded-2xl`, which would otherwise compile to nothing (square corners).
export default { presets: [kit], content: ['./index.html', './src/**/*.{js,jsx}'], theme: { extend: { borderRadius: { '2xl': 'var(--radius-card)', '3xl': 'var(--radius-card)' } } } };
