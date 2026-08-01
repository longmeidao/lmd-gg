import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.test.jsonc' },
      miniflare: { bindings: { GITHUB_TOKEN: 'test-token' } },
    }),
  ],
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['e2e/**'],
  },
});
