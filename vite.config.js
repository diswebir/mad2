import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// BASE_PATH lets the same build run under a domain root or a cPanel sub-directory.
const rawBase = (process.env.BASE_PATH || '').trim();
const base = rawBase && rawBase !== '/' ? `/${rawBase.replace(/^\/+|\/+$/g, '')}/` : '/';
export default defineConfig({
  base,
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: ['.e2b.app', 'localhost'],
    proxy: { [`${base}api`]: 'http://127.0.0.1:3001' },
  },
  build: { target: 'es2020', chunkSizeWarningLimit: 750 },
});
