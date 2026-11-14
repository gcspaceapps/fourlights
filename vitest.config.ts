// Unit tests live in web/tests and api/tests. The end-to-end tests in e2e/
// are Playwright's and are not run here. `npm run coverage` adds a coverage report.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['web/tests/**/*.test.ts', 'api/tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['web/src/**', 'api/src/**'],
      reporter: ['text', 'html'],
      reportsDirectory: 'coverage/web',
    },
  },
});
