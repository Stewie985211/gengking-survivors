import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  publicDir: false,
  build: { chunkSizeWarningLimit: 1600 },
  server: { host: '127.0.0.1', strictPort: true }
});
