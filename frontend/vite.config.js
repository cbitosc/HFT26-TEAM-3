import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The API runs on :8000; proxying keeps the browser on one origin (no CORS, Range requests for video work unchanged).
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, watch: { usePolling: true, interval: 500 }, proxy: { '/api': process.env.TRACELINE_API_URL || 'http://127.0.0.1:8010' } },
});
