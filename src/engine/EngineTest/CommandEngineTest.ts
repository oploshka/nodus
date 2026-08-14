import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type { EngineTestContext, EngineTestRunResult } from '@engine/EngineTest/EngineTest.js';

const execAsync = promisify(exec);

export interface EngineTestCommandConfiguration {
  command: string;
  timeoutMs?: number;
  when?: 'always' | 'changes';
}

/** One concrete project-level command test. */
export abstract class CommandEngineTest {
  public abstract readonly id: string;

  protected constructor(
    private readonly projectRoot: string,
    private readonly configuration: EngineTestCommandConfiguration,
  ) {}

  public async runOne(context: EngineTestContext): Promise<EngineTestRunResult> {
    const startedAt = performance.now();
    if ((this.configuration.when ?? 'changes') === 'changes' && context.changedPaths.length === 0) {
      return { id: this.id, status: 'skipped', durationMs: performance.now() - startedAt, reason: 'task did not change project files' };
    }

    try {
      const result = await execAsync(this.configuration.command, {
        cwd: this.projectRoot,
        timeout: this.configuration.timeoutMs ?? 120_000,
        windowsHide: true,
        maxBuffer: 4 * 1024 * 1024,
      });
      const details = compactOutput(result.stdout, result.stderr);
      return { id: this.id, status: 'passed', durationMs: performance.now() - startedAt, details: details.length > 0 ? details : undefined };
    } catch (error) {
      const value = error as Error & { stdout?: string; stderr?: string; code?: number | string };
      return {
        id: this.id,
        status: 'failed',
        durationMs: performance.now() - startedAt,
        reason: value.code === undefined ? value.message : `command exited with code ${String(value.code)}`,
        details: compactOutput(value.stdout, value.stderr, value.message),
      };
    }
  }
}

function compactOutput(...values: Array<string | undefined>): string[] {
  return values
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .map((value) => value.length > 4000 ? `${value.slice(0, 4000)}\n…` : value);
}
