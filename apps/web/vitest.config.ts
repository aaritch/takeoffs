import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Integration tests share one Postgres database (migrations + truncation between cases).
    // Run test files serially so they don't race on DDL or each other's data.
    fileParallelism: false,
  },
});
