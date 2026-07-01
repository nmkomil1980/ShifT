import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// During development the API runs separately (node src/server.js in
// ../shiftflow-mvp). We proxy /api to it so the browser hits one origin and
// the session cookie flows without CORS in dev.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.API_TARGET || 'http://127.0.0.1:3000',
        changeOrigin: true
      }
    }
  }
});
