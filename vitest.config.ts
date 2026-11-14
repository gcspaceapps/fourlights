// Unit tests live in web/tests (they also cover api/src/intent.ts). The end-to-end tests in e2e/
// are Playwright's and are not run here. `npm run coverage` adds a coverage report.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    dir: 'web',
    coverage: {
      provider: 'v8',
      include: ['web/src/**', 'api/src/**'],
      reporter: ['text', 'html'],
      reportsDirectory: 'coverage/web',
    },
  },
});
