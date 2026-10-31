import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// jsdom lacks these; the tests give the layout a fixed 800 px width
class RO { constructor(cb) { this.cb = cb; } observe(el) { this.cb([{ contentRect: { width: 800, height: 300 }, target: el }]); } disconnect() {} unobserve() {} }
globalThis.ResizeObserver = RO;
window.matchMedia = window.matchMedia || ((q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
window.HTMLElement.prototype.scrollIntoView = vi.fn();
afterEach(() => cleanup());
globalThis.IntersectionObserver = class { constructor(cb) { this.cb = cb; } observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
