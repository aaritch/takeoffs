// Flat ESLint config shared across the workspace (ESLint 9+).
// One of P0-01's jobs is to enforce module boundaries with lint rules NOW, while there is
// nothing to break: services/packages must import each other ONLY through published
// package entrypoints (e.g. `@takeoff/contracts`), never via deep internal paths.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/next-env.d.ts',
      '**/.turbo/**',
      '**/coverage/**',
      '**/*.min.js',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Boundary enforcement: never reach into another internal package's internals.
      // Import from the package root only (e.g. `@takeoff/geometry`, not
      // `@takeoff/geometry/src/...` or `.../dist/...`).
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@takeoff/*/src/*', '@takeoff/*/dist/*'],
              message:
                'Import from the package root (e.g. "@takeoff/contracts"), never its internals.',
            },
          ],
        },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  // Config files run in Node and may use console / require-style patterns.
  {
    files: ['**/*.config.{js,mjs,cjs,ts}', 'tools/**'],
    rules: {
      'no-console': 'off',
    },
  },
  prettier,
);
