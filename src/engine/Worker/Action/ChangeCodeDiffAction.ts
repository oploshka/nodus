import { PatchApplicator } from '@engine/Worker/Edit/PatchApplicator.js';
import {
  ChangeCodeAction,
  type ChangeCodeActionInput,
  type ChangeCodeActionProfile,
  type ChangeCodeApplyResult,
  type ChangeCodeEdit,
} from '@engine/Worker/Action/ChangeCodeAction.js';
import type { EngineLogger } from '@engine/Type/EngineLogger.js';
import type { Project } from '@engine/Project/Project.js';
import { callDiffFile } from '@model/Runner/ModelCaller.js';
import type { ModelRunner } from '@model/Runner/ModelRunner.js';
import { ModelRequestFormat } from '@model/Request/ModelRequestFormat.js';

/** Unified-diff implementation kept as an explicit alternative editing strategy. */
export class ChangeCodeDiffAction extends ChangeCodeAction {
  public readonly id = 'change-code-diff';
  public readonly description = 'Apply one coherent project/code change using unified diff edits.';

  public constructor(
    project: Project,
    model: ModelRunner,
    logger: EngineLogger,
    profile: ChangeCodeActionProfile,
    defaultModelSettings: ChangeCodeActionInput['settings'] = undefined,
    maxEditsPerAttempt = 6,
    private readonly maxEditAttempts = 3,
    private readonly applicator = new PatchApplicator(),
  ) {
    super(project, model, logger, profile, defaultModelSettings, maxEditsPerAttempt);
  }

  protected async applyEdit(context: ChangeCodeActionInput, edit: ChangeCodeEdit): Promise<ChangeCodeApplyResult> {
    let lastError: string | undefined;
    const path = await this.project.resolvePath(edit.path);

    for (let editAttempt = 1; editAttempt <= this.maxEditAttempts; editAttempt += 1) {
      const source = await this.project.read(path);

      try {
        const response = await callDiffFile(this.model, this.logger, {
          path,
          request: {
            message: editAttempt === 1
              ? 'Apply this concrete project edit using unified diff.'
              : 'Repair the failed unified-diff edit against the current authoritative file.',
            data: {
              task: context.task.description,
              step: context.step,
              instruction: edit.instruction,
              knowledge: context.knowledge.map((item) => ({ question: item.question, status: item.status, answer: item.answer })),
              authoritativeSource: { path, content: source },
              recovery: editAttempt === 1 ? undefined : { attempt: editAttempt, previousError: lastError },
            },
            format: ModelRequestFormat.Json,
            guidance: [
              this.profile.guidance,
              `Use ${this.profile.language.nodus} for internal reasoning/instructions and preserve code identifiers exactly.`,
              `Use ${this.profile.language.project} for new human-authored project text unless the task explicitly requests another language.`,
              'Edit exactly the authoritative file supplied in DATA.',
              'Treat authoritativeSource.content as the current source of truth.',
              editAttempt === 1
                ? 'Return the minimal unified diff for this file only.'
                : 'The previous patch could not be applied. Regenerate the diff from scratch against the current authoritative source and fix only this edit.',
              'Include enough unchanged context for deterministic patch application.',
              'Do not change unrelated code or documentation.',
            ].join('\n'),
          },
        });

        const content = this.applicator.apply(source, response.hunks, path);
        if (content === source) return { status: 'completed', changed: false, path };
        await this.project.write(path, content);
        if (editAttempt > 1) this.logger.info('worker.edit.recovered', { strategy: 'diff', path, editAttempt });
        return { status: 'completed', changed: true, path };
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        this.logger.warn('worker.edit.error', {
          strategy: 'diff',
          path,
          editAttempt,
          maxEditAttempts: this.maxEditAttempts,
          error: lastError,
        });
      }
    }

    return {
      status: 'not-completed',
      reason: `Diff edit recovery limit reached (${this.maxEditAttempts}) for ${path}. Last error: ${lastError ?? 'unknown edit error'}`,
    };
  }
}
