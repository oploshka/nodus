import { EditApplicatorPatch } from '@engine/Process/Edit/Applicator/EditApplicatorPatch.js';
import { ModelLanguagePolicy } from '@engine/Common/Language/ModelLanguagePolicy.js';
import type { EditStrategy } from '@engine/Process/Edit/EditStrategy.js';
import type { EditPreparationContext, EditPrepareResult } from '@engine/Process/Edit/EditTypes.js';
import type { LanguageConfiguration } from '@engine/Type/LanguageConfiguration.js';
import { ModelRequestFormat } from '@model/Request/ModelRequestFormat.js';
import { callDiffFile } from '@model/Runner/ModelCaller.js';
import type { ModelRunner } from '@model/Runner/ModelRunner.js';

export class EditStrategyDiff implements EditStrategy {
  public readonly id = 'diff' as const;
  public constructor(
    private readonly model: ModelRunner,
    private readonly language: LanguageConfiguration,
    private readonly guidance: string,
    private readonly maxEditAttempts = 3,
    private readonly applicator = new EditApplicatorPatch(),
  ) {}

  public async prepare(context: EditPreparationContext): Promise<EditPrepareResult> {
    const path = context.edit.path;
    const creating = context.edit.type === 'create';
    let lastError: string | undefined;
    for (let attempt = 1; attempt <= this.maxEditAttempts; attempt += 1) {
      try {
        const response = await callDiffFile(this.model, context.emit, {
          path,
          request: {
            message: creating
              ? (attempt === 1
                  ? 'Create this new project file using unified diff against an empty authoritative source.'
                  : 'Repair the failed new-file unified diff against the empty authoritative source.')
              : (attempt === 1
                  ? 'Apply this concrete project edit using unified diff.'
                  : 'Repair the failed unified-diff edit against the current authoritative file.'),
            data: {
              task: context.task.description,
              step: context.step,
              instruction: context.edit.instruction,
              authoritativeSource: { path, content: context.source },
              recovery: attempt === 1 ? undefined : { attempt, previousError: lastError },
            },
            format: ModelRequestFormat.Json,
            guidance: [
              this.guidance,
              ...new ModelLanguagePolicy(this.language).mixedProjectEdit(),
              creating
                ? 'The target file does not exist yet. Treat authoritativeSource.content as an empty source and add the complete intended file.'
                : 'Edit exactly the authoritative file supplied in DATA.',
              'Treat authoritativeSource.content as the current source of truth.',
              attempt === 1
                ? (creating
                    ? 'Return one minimal new-file unified diff that adds the complete file content.'
                    : 'Return the minimal unified diff for this file only.')
                : 'Regenerate the diff from scratch against the authoritative source and fix only this file change.',
              creating
                ? 'Do not remove or reference old lines because the authoritative source is empty.'
                : 'Include enough unchanged context for deterministic patch application.',
              'Do not change unrelated content.',
            ].join('\n'),
          },
        });
        const content = this.applicator.apply(context.source, response.hunks, path);
        if (attempt > 1) {
          context.emit({ type: 'edit.strategy.recovered', data: { strategy: this.id, path, editAttempt: attempt } });
        }
        return { status: 'completed', path, content, operations: response.hunks.length };
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        context.emit({
          type: 'edit.strategy.retry',
          level: 'warning',
          data: { strategy: this.id, path, editAttempt: attempt, maxEditAttempts: this.maxEditAttempts, error: lastError },
        });
      }
    }
    return {
      status: 'not-completed',
      reason: `Diff edit recovery limit reached (${this.maxEditAttempts}) for ${path}. Last error: ${lastError ?? 'unknown edit error'}`,
    };
  }
}
