// StartupCleanupSmoke.ts
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { HumanInteraction } from '@agent/Human/HumanInteraction';
import type { NodusConfiguration } from '@core/Configuration/Configuration';
import { Nodus } from '@core/Nodus/Nodus';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function exists(path: string): Promise<boolean> {
  try {
    await readFile(path);
    return true;
  } catch {
    return false;
  }
}

const root = await mkdtemp(join(tmpdir(), 'nodus-cleanup-'));
const cachePath = join(root, '.nodus/cache/project-index.json');
const logPath = join(root, '.nodus/log/nodus.log');
const oldExecutionPath = join(root, '.nodus/log/executions/old/execution.log');

await mkdir(join(root, '.nodus/cache'), { recursive: true });
await mkdir(join(root, '.nodus/log/executions/old'), { recursive: true });
await writeFile(cachePath, '{"old":true}', 'utf8');
await writeFile(logPath, 'OLD LOG\n', 'utf8');
await writeFile(oldExecutionPath, 'OLD EXECUTION\n', 'utf8');

const configuration: NodusConfiguration = {
  project: {
    id: 'cleanup-test',
    root,
    scanMode: 'manual',
    cachePath: '.nodus/cache/project-index.json',
    clearCacheOnStart: true,
    include: [],
    exclude: ['.nodus'],
  },
  model: {
    provider: 'mock',
    model: 'mock',
    temperature: 0,
    maxTokens: 256,
  },
  agent: {
    maxSteps: 20,
    responseLanguage: 'auto',
    internalLanguage: 'original',
  },
  knowledge: {
    generationMode: 'disabled',
  },
  logging: {
    level: 'debug',
    console: false,
    file: true,
    path: '.nodus/log/nodus.log',
    modelPayload: false,
    payloadPath: '.nodus/log/executions',
    executionPath: '.nodus/log/executions',
    consoleMode: 'quiet',
    colors: false,
    clearOnStart: true,
  },
};

const human: HumanInteraction = { ask: async () => '' };
const nodus = new Nodus(configuration, human);
await nodus.initialize();

assert(!(await exists(cachePath)), 'project cache should be removed on startup');
assert(!(await exists(oldExecutionPath)), 'old execution logs should be removed on startup');
const currentLog = await readFile(logPath, 'utf8');
assert(!currentLog.includes('OLD LOG'), 'main log should not keep old content');
assert(currentLog.includes('logs-cleared'), 'main log should record cleanup after truncation');

await rm(root, { recursive: true, force: true });

console.log('## Startup cleanup smoke test');
console.log('project cache cleared: OK');
console.log('old execution logs cleared: OK');
console.log('fresh log recreated: OK');
console.log('PASS: startup cleanup flags work.');
