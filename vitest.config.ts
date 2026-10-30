import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  test: { silent: 'passed-only', environment: 'node', restoreMocks: true, env: { TMDB_API_KEY: 'test-only-key' } },
});
