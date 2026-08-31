import type { EngineLogger } from '@engine/Type/EngineLogger.js';
import type { FileSystem } from '@engine/Common/Tools/FileSystem.js';
import { EngineStep } from '@engine/Core/EngineStep.js';
import type { sEngineOutput, sEngineSchemaStep } from '@engine/Core/EngineSchemaTsType.js';
import type { tEngineRunDependencies } from '@engine/Core/EngineStepInterface.js';
import { callDiffFile } from '@model/Runner/ModelCaller.js';
import type { ModelRunner } from '@model/Runner/ModelRunner.js';
import { ModelRequestFormat } from '@model/Request/ModelRequestFormat.js';
import type { UnifiedDiffHunk } from '@model/Response/Format/DiffResponseFormatHandler.js';
import { actionCoreResult, readActionCoreResult } from './ActionCoreResult.js';

interface EditIntent {
  path: string;
  instruction: string;
}

interface ChangeCodeActionData {
  summary: string;
  edit?: {
    strategy: 'range-replace';
    edits: EditIntent[];
  };
}

interface ApplyEditRuntime {
  fileSystem: FileSystem;
  model: ModelRunner;
  logger: EngineLogger;
}

/** Applies semantic edit intents using the per-run model and project filesystem. */
export class ApplyEditAction extends EngineStep {
  public getId(): string {
    return 'apply-edit';
  }

  public getGroup(): string {
    return 'action';
  }

  public async run(
    step: sEngineSchemaStep,
    dependencies: tEngineRunDependencies,
  ): Promise<sEngineOutput> {
    const change = readActionCoreResult<ChangeCodeActionData>(step.computedContext?.previous?.output);
    if (!change || change.status !== 'completed') {
      return actionCoreResult({
        status: 'failed',
        reason: 'ActionEditApply requires the previous completed ActionCodeChange output.',
        canContinue: false,
      });
    }

    if (!change.data.edit) {
      return actionCoreResult({ status: 'completed', data: { summary: change.data.summary } });
    }

    try {
      const result = await applyEdits(runtimeDependencies(dependencies), change.data.edit.edits);
      return actionCoreResult({
        status: 'completed',
        data: {
          summary: change.data.summary,
          edit: {
            files: result.paths.length,
            operations: result.operations,
            strategy: 'diff',
            paths: result.paths,
          },
        },
      });
    } catch (error) {
      return actionCoreResult({
        status: 'not-completed',
        reason: error instanceof Error ? error.message : String(error),
        canContinue: true,
      });
    }
  }
}

async function applyEdits(
  runtime: ApplyEditRuntime,
  edits: readonly EditIntent[],
): Promise<{ paths: string[]; operations: number }> {
  if (edits.length === 0) throw new Error('ActionEditApply received no edit intents.');

  const prepared: Array<{ path: string; content: string; operations: number }> = [];

  for (const edit of edits) {
    const path = await runtime.fileSystem.resolvePath(edit.path);
    const source = await runtime.fileSystem.read(path);
    const diff = await callDiffFile(runtime.model, runtime.logger, {
      path,
      request: {
        message: 'Apply the requested semantic edit to this file.',
        data: {
          path,
          instruction: edit.instruction,
          content: source,
        },
        format: ModelRequestFormat.Json,
        guidance: [
          'Modify only the requested file.',
          'Preserve unrelated content exactly.',
          'Implement the instruction with the smallest sufficient change.',
        ].join('\n'),
      },
    });

    prepared.push({
      path,
      content: applyUnifiedDiff(source, diff.hunks),
      operations: diff.hunks.reduce(
        (total, hunk) => total + hunk.lines.filter((line) => line.type !== 'context').length,
        0,
      ),
    });
  }

  for (const item of prepared) {
    await runtime.fileSystem.write(item.path, item.content);
  }

  return {
    paths: prepared.map((item) => item.path),
    operations: prepared.reduce((total, item) => total + item.operations, 0),
  };
}

function runtimeDependencies(dependencies: tEngineRunDependencies): ApplyEditRuntime {
  const target = dependencies.target as { fileSystem?: FileSystem } | undefined;
  const model = dependencies.model as ModelRunner | undefined;
  const logger = dependencies.logger as EngineLogger | undefined;
  if (!target?.fileSystem || !model || !logger) {
    throw new Error('ActionEditApply requires runtime target, model and logger.');
  }
  return { fileSystem: target.fileSystem, model, logger };
}

function applyUnifiedDiff(source: string, hunks: readonly UnifiedDiffHunk[]): string {
  const normalized = source.replace(/\r\n/g, '\n');
  const trailingNewline = normalized.endsWith('\n');
  const lines = normalized.split('\n');
  if (trailingNewline) lines.pop();

  let offset = 0;
  for (const hunk of hunks) {
    const start = hunk.oldStart - 1 + offset;
    if (start < 0 || start > lines.length) throw new Error(`Diff hunk starts outside source at line ${hunk.oldStart}.`);

    let cursor = start;
    const replacement: string[] = [];
    for (const line of hunk.lines) {
      if (line.type === 'add') {
        replacement.push(line.text);
        continue;
      }

      if (lines[cursor] !== line.text) {
        throw new Error(`Diff context mismatch at source line ${cursor + 1}.`);
      }

      if (line.type === 'context') replacement.push(line.text);
      cursor += 1;
    }

    const removed = cursor - start;
    lines.splice(start, removed, ...replacement);
    offset += replacement.length - removed;
  }

  const result = lines.join('\n');
  return trailingNewline ? `${result}\n` : result;
}
