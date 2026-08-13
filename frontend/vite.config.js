import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: process.env.MOSAIC_API_URL ?? 'http://localhost:8081',
        changeOrigin: true,
      },
    },
  },
});
