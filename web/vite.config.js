import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development, API calls go to the local API (npm start in the repo root).
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': process.env.API_URL || 'http://localhost:3000', '/health': process.env.API_URL || 'http://localhost:3000' } },
});
