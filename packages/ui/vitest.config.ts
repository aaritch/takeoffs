import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Components are tested by rendering into a DOM; use the new JSX transform (no React import).
  esbuild: { jsx: 'automatic' },
  test: { environment: 'jsdom' },
});
