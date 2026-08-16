import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@app': `${root}src/app`,
      '@engine/Planner': `${root}src/engine/Process/Planner`,
      '@engine/Determine': `${root}src/engine/Process/Determine`,
      '@engine/Worker': `${root}src/engine/Process/Worker`,
      '@engine/Research': `${root}src/engine/Process/Research`,
      '@engine/Edit': `${root}src/engine/Process/Edit`,
      '@engine/EngineTest': `${root}src/engine/Process/EngineTest`,
      '@engine/Task': `${root}src/engine/Common/Task`,
      '@engine/Presentation': `${root}src/engine/Common/Presentation`,
      '@engine/Language': `${root}src/engine/Common/Language`,
      '@engine/Metrics': `${root}src/engine/Common/Metrics`,
      '@engine': `${root}src/engine`,
      '@model': `${root}src/model`,
      '@test': `${root}test`,
      '@target': `${root}target`,
      '@benchmark': `${root}target/benchmark`,
      '@mock': `${root}target/mock`,
      '@project': `${root}target/project`,
      '@test-framework': `${root}target/test-framework`,
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
