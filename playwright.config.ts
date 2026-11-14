// End-to-end tests: the real page in Chrome against a local Worker. Slow, so they are not part of
// `npm run check`; run them with `npm run test:e2e` before a deploy that changes behaviour.
// To watch them: `npm run test:e2e:watch` (a real Chrome window, one test at a time, slowed
// down) or `npm run test:e2e:ui` (Playwright's own window: pick tests, step through, time-travel).
// Two local Workers: one open (port 8797), one with the password gate on (port 8798).
import { defineConfig } from '@playwright/test';

const OPEN = 'http://127.0.0.1:8797';
const GATED = 'http://127.0.0.1:8798';

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: [['list']],
  use: {
    baseURL: OPEN,
    channel: 'chrome', // the installed Chrome: no browser download
    // `npm run test:e2e:watch` sets SLOWMO so each step is slow enough to follow by eye.
    launchOptions: { slowMo: Number(process.env.SLOWMO ?? 0) },
    viewport: { width: 1280, height: 900 },
    trace: 'retain-on-failure',
  },
  metadata: { gated: GATED },
  webServer: [
    {
      command:
        'npm run build && npx wrangler dev --port 8797 --inspector-port 9297 --ip 127.0.0.1 --env-file e2e/open.vars',
      url: `${OPEN}/api/health`,
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command:
        'npx wrangler dev --port 8798 --inspector-port 9298 --ip 127.0.0.1 --env-file e2e/gated.vars',
      url: `${GATED}/api/health`, // answers 401, which counts as ready
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
