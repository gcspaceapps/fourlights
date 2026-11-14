import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Two pages: the app, and the data-sources page (served at /sources).
    rollupOptions: { input: { main: 'index.html', sources: 'sources.html' } },
  },
});
