import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Component tests (.tsx) use the automatic JSX runtime; opt a file into the DOM with the
  // `// @vitest-environment jsdom` pragma. The default stays node for DB integration tests.
  esbuild: { jsx: 'automatic' },
  test: {
    // Integration tests share one Postgres database (migrations + truncation between cases).
    // Run test files serially so they don't race on DDL or each other's data.
    fileParallelism: false,
  },
});
