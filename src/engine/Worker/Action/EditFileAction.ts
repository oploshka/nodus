import type { EngineLogger } from '@engine/Type/EngineLogger.js';
import type { ModelRunner } from '@model/Runner/ModelRunner.js';
import { callDiffFile } from '@model/Runner/ModelCaller.js';
import { ModelRequestFormat } from '@model/Request/ModelRequestFormat.js';
import type { Project } from '@engine/Project/Project.js';
import type { ExecutionAction, ExecutionActionContext } from '@engine/Worker/Action/ExecutionAction.js';
import { PatchApplicator } from '@engine/Worker/Edit/PatchApplicator.js';

interface EditFileInput {
  path: string;
  instruction: string;
}

export class EditFileAction implements ExecutionAction {
  public readonly id = 'edit-file';
  public readonly description = 'Apply one focused edit to one known project file. Input: {"path":"relative/path","instruction":"what this edit must achieve"}';

  public constructor(
    private readonly project: Project,
    private readonly model: ModelRunner,
    private readonly logger: EngineLogger,
    public readonly maxUses = 2,
    private readonly applicator = new PatchApplicator(),
  ) {}

  public async execute(input: unknown, context: ExecutionActionContext) {
    const request = this.parse(input);
    const source = await this.project.read(request.path);
    const research = context.state.history
      .filter((entry) => entry.actionId === 'research' && entry.result.status === 'completed')
      .map((entry) => entry.result.data)
      .filter((value) => value !== undefined);

    let lastError: string | undefined;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const data = {
          task: context.state.task.description,
          planStep: context.state.step,
          editInstruction: request.instruction,
          research,
          previousEditError: lastError,
          authoritativeSource: { path: request.path, content: source },
        };

        const response = await callDiffFile(this.model, this.logger, {
          path: request.path,
          request: {
            message: 'Produce the minimal patch required for this focused file edit.',
            data,
            format: ModelRequestFormat.Json,
            guidance: [
              'You perform one focused file edit inside Nodus.',
              'Use the authoritative source exactly as supplied.',
              'Do not request tools and do not edit another file.',
              'Preserve unrelated content.',
            ].join('\n'),
          },
        });

        const content = this.applicator.apply(source, response.hunks, request.path);
        await this.project.write(request.path, content);
        return {
          status: 'completed' as const,
          summary: `Edited ${request.path}`,
          data: { path: request.path, changed: content !== source },
        };
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
    }

    return { status: 'failed' as const, summary: lastError ?? `Failed to edit ${request.path}`, fatal: false };
  }

  private parse(input: unknown): EditFileInput {
    if (!input || typeof input !== 'object') throw new Error('edit-file input must be an object');
    const record = input as Record<string, unknown>;
    if (typeof record.path !== 'string' || !record.path.trim()) throw new Error('edit-file input requires path');
    if (typeof record.instruction !== 'string' || !record.instruction.trim()) throw new Error('edit-file input requires instruction');
    return { path: record.path.trim(), instruction: record.instruction.trim() };
  }
}
