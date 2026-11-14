// One Vite build for the whole app: the page (index.html + web/src) and, through the Cloudflare
// Vite plugin, the Worker in api/ (configured in cloudflare.config.ts). `cf dev` and `cf build`
// run Vite; web/public (including the published data) is copied into the static assets.
import { cloudflare } from '@cloudflare/vite-plugin';
import { defineConfig } from 'vite';

export default defineConfig({
  publicDir: 'web/public',
  plugins: [cloudflare()],
});
