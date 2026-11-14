import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Three pages: the app, the data-sources page (/sources) and how we built it (/how).
    rollupOptions: { input: { main: 'index.html', sources: 'sources.html', how: 'how.html' } },
  },
});
