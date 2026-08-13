import { PatchApplicator } from '@engine/Edit/Applicator/PatchApplicator.js';
import type { EditStrategy } from '@engine/Edit/EditStrategy.js';
import type { EditPreparationContext, EditPrepareResult } from '@engine/Edit/EditTypes.js';
import type { EngineLogger } from '@engine/Type/EngineLogger.js';
import { callDiffFile } from '@model/Runner/ModelCaller.js';
import type { ModelRunner } from '@model/Runner/ModelRunner.js';
import { ModelLanguagePolicy } from '@engine/Language/ModelLanguagePolicy.js';
import type { LanguageConfiguration } from '@engine/Type/LanguageConfiguration.js';
import { ModelRequestFormat } from '@model/Request/ModelRequestFormat.js';

export class DiffEditStrategy implements EditStrategy {
  public readonly id = 'diff' as const;
  public constructor(
    private readonly model: ModelRunner,
    private readonly logger: EngineLogger,
    private readonly language: LanguageConfiguration,
    private readonly guidance: string,
    private readonly maxEditAttempts = 3,
    private readonly applicator = new PatchApplicator(),
  ) {}

  public async prepare(context: EditPreparationContext): Promise<EditPrepareResult> {
    const path = context.edit.path;
    let lastError: string | undefined;
    for (let attempt = 1; attempt <= this.maxEditAttempts; attempt += 1) {
      try {
        const response = await callDiffFile(this.model, this.editModelLogger(), {
          path,
          request: {
            message: attempt === 1 ? 'Apply this concrete project edit using unified diff.' : 'Repair the failed unified-diff edit against the current authoritative file.',
            data: { task: context.task.description, step: context.step, instruction: context.edit.instruction, authoritativeSource: { path, content: context.source }, recovery: attempt === 1 ? undefined : { attempt, previousError: lastError } },
            format: ModelRequestFormat.Json,
            guidance: [
              this.guidance,
              ...new ModelLanguagePolicy(this.language).mixedProjectEdit(),
              'Edit exactly the authoritative file supplied in DATA.',
              'Treat authoritativeSource.content as the current source of truth.',
              attempt === 1 ? 'Return the minimal unified diff for this file only.' : 'Regenerate the diff from scratch against the current authoritative source and fix only this edit.',
              'Include enough unchanged context for deterministic patch application.',
              'Do not change unrelated content.',
            ].join('\n'),
          },
        });
        const content = this.applicator.apply(context.source, response.hunks, path);
        if (attempt > 1) this.logger.info('engine.edit.recovered', { strategy: this.id, path, editAttempt: attempt });
        return { status: 'completed', path, content, operations: response.hunks.length };
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        this.logger.warn('engine.edit.error', { strategy: this.id, path, editAttempt: attempt, maxEditAttempts: this.maxEditAttempts, error: lastError });
      }
    }
    return { status: 'not-completed', reason: `Diff edit recovery limit reached (${this.maxEditAttempts}) for ${path}. Last error: ${lastError ?? 'unknown edit error'}` };
  }

  private editModelLogger(): EngineLogger {
    return {
      info: (event, data) => this.logger.info(`engine.edit.model.${event}`, data),
      warn: (event, data) => this.logger.warn(`engine.edit.model.${event}`, data),
      error: (event, data) => this.logger.error(`engine.edit.model.${event}`, data),
    };
  }
}
