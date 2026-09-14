import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    proxy: {
      '/api': {
        target: process.env.MOSAIC_API_URL ?? 'http://localhost:8081',
        // Preserve the browser host so the API can verify same-origin CSV writes.
        changeOrigin: false,
      },
    },
  },
});
