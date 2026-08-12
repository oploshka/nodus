import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@app': `${root}src/app`,
      '@engine': `${root}src/engine`,
      '@model': `${root}src/model`,
      '@test': `${root}test`,
      '@bench': `${root}benchmark`,
    },
  },
  test: {
    environment: 'node',
    projects: [
      { extends: true, test: { name: 'unit', include: ['test/unit/**/*.test.ts'] } },
      { extends: true, test: { name: 'integration', include: ['test/integration/**/*.test.ts'], fileParallelism: false } },
      { extends: true, test: { name: 'model', include: ['test/model/**/*.test.ts'], fileParallelism: false, testTimeout: 600_000, hookTimeout: 600_000 } },
      { extends: true, test: { name: 'e2e', include: ['test/e2e/**/*.test.ts'], fileParallelism: false, testTimeout: 600_000, hookTimeout: 600_000 } },
    ],
  },
});
