// The one Cloudflare Worker: Hono API (api/src) + the static page built by Vite (vite.config.ts).
// Deployed with the cf CLI: `npm run deploy`.
import { bindings, defineConfig } from 'cf/config';

export default defineConfig({
  accountId: 'e3cb8bffb3a1a6e6009c50fdf0bc6b82', // gcspaceapps: never rely on a default account
  worker: {
    // Obscure name on purpose until the repo goes public (Sun 15 Nov 19:30 AEST).
    name: 'q7m3-demo',
    compatibilityDate: '2026-11-01',
    entrypoint: 'api/src/index.ts',
    // One URL: the custom domain. No <name>.workers.dev.
    domains: ['fourlights.gcsa.space'],
    workersDev: false,
    // Preview URLs for `npm run preview -- <alias>` (cf workers versions create --preview-alias).
    // A version runs with the Worker's secrets, so previews are password-gated too.
    previewUrls: true,
    observability: { enabled: true },
    // Every request goes through the Worker so the weekend password covers pages and data too.
    // Secret SITE_PASSWORD: unset it and the site is open (see api/CONTEXT.md).
    assets: { runWorkerFirst: true },
    env: {
      ASSETS: bindings.assets(),
    },
  },
});
