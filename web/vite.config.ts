import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Four pages: the app, the data-sources page (/sources), how we built it (/how) and the QGIS
    // guide (/qgis; the layer files it points at are static files under /qgis/).
    rollupOptions: {
      input: { main: 'index.html', sources: 'sources.html', how: 'how.html', qgis: 'qgis.html' },
    },
  },
});
