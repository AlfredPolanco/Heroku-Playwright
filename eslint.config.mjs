import js from '@eslint/js';
import playwright from 'eslint-plugin-playwright';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['node_modules/', 'playwright-report/', 'test-results/', 'blob-report/'],
  },

  js.configs.recommended,

  /* Type-aware linting: catches the mistake that matters most in a Playwright
     suite -- a forgotten `await` on an assertion or action, which silently
     turns a test into a no-op. */
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  /* Playwright rules apply to specs only; page objects are plain classes and
     would trip rules that assume test files. */
  {
    ...playwright.configs['flat/recommended'],
    files: ['tests/**/*.spec.ts'],
    rules: {
      ...playwright.configs['flat/recommended'].rules,
      /* Promote the anti-flake rules this project explicitly commits to from
         warnings into build-breaking errors. */
      'playwright/no-wait-for-timeout': 'error',
      'playwright/no-element-handle': 'error',
      'playwright/no-force-option': 'error',
      'playwright/no-page-pause': 'error',
      'playwright/no-skipped-test': 'error',
      'playwright/expect-expect': 'error',
      'playwright/prefer-web-first-assertions': 'error',
      'playwright/require-top-level-describe': 'error',
    },
  },

  /* Plain JS files are outside tsconfig's type-aware program, so type-aware
     linting (and the project service) must be switched off for them. Kept as
     its own config object: spreading it alongside a `languageOptions` of our
     own would overwrite the `parserOptions` that disables the project service. */
  {
    files: ['**/*.{js,mjs,cjs}'],
    ...tseslint.configs.disableTypeChecked,
  },

  /* The local-app harness is CommonJS and runs on Node, so it needs Node globals. */
  {
    files: ['**/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        console: 'readonly',
        process: 'readonly',
        module: 'writable',
        require: 'readonly',
        __dirname: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
      },
    },
    rules: {
      /* These files are intentionally CommonJS: the harness must run under a
         bare `node file.js` with no build step and no package type field. */
      '@typescript-eslint/no-require-imports': 'off',
    },
  },

  prettier,
);
