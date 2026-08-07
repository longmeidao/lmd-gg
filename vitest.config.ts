import path from 'node:path';
import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.test.jsonc' },
      miniflare: { bindings: { GITHUB_TOKEN: 'test-token' } },
    }),
  ],
  // cloudflare 池不读 tsconfig 的 paths，这里补一份
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '~@': path.resolve(__dirname),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['e2e/**'],
  },
});
