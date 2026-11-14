import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '.wrangler/**',
      'web/public/**',
      'pipeline/**',
      'coverage/**',
      'test-results/**',
      'playwright-report/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  { files: ['scripts/**', '*.js'], languageOptions: { globals: globals.node } },
  { files: ['web/src/**'], languageOptions: { globals: globals.browser } },
);
