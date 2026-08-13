import {
  ChangeCodeAction,
  type ChangeCodeActionInput,
  type ChangeCodeActionProfile,
  type ChangeCodePrepareResult,
  type ChangeCodeEdit,
} from '@engine/Worker/Action/ChangeCodeAction.js';
import { ReplaceApplicator, type ReplaceOperation } from '@engine/Worker/Edit/ReplaceApplicator.js';
import type { EngineLogger } from '@engine/Type/EngineLogger.js';
import type { Project } from '@engine/Project/Project.js';
import { callModel } from '@model/Runner/ModelCaller.js';
import type { ModelRunner } from '@model/Runner/ModelRunner.js';
import { ActionPresentation } from '@engine/Presentation/ActionPresentation.js';
import { ModelRequestFormat } from '@model/Request/ModelRequestFormat.js';
import { ModelResponseFormat } from '@model/Response/ModelResponseFormat.js';
import type { ModelResponseSchema } from '@model/Response/ModelResponseSchema.js';

interface ReplaceFileResponse {
  path: string;
  operations: ReplaceOperation[];
}

const replaceSchema: ModelResponseSchema = {
  description: 'Exact guarded replacements for one authoritative file.',
  fields: {
    path: { type: 'string', description: 'Project-root-relative path of the authoritative file.' },
    operations: {
      type: 'array',
      description: 'Small exact replacements. line is only a location hint; before must match current source exactly.',
      items: {
        type: 'object',
        fields: {
          line: { type: 'number', description: 'Approximate 1-based line where before currently starts.' },
          before: { type: 'string', description: 'Exact current source block to replace.' },
          after: { type: 'string', description: 'Complete replacement block. Empty string deletes before.' },
        },
      },
    },
  },
};

/** Primary experimental editing strategy: exact replace blocks guarded by current source text. */
export class ChangeCodeReplaceAction extends ChangeCodeAction {
  public readonly id = 'change-code-replace';
  public readonly presentation = new ActionPresentation({
    name: { en: 'Code change', ru: 'Изменение кода' },
    detail: 'replace',
  });
  public readonly name = this.presentation.name();
  public readonly method = this.presentation.detail();
  public readonly description = 'Apply one coherent project/code change using exact before/after replacements with line hints.';

  public constructor(
    project: Project,
    model: ModelRunner,
    logger: EngineLogger,
    profile: ChangeCodeActionProfile,
    defaultModelSettings: ChangeCodeActionInput['settings'] = undefined,
    maxEditsPerAttempt = 6,
    private readonly maxEditAttempts = 2,
    private readonly applicator = new ReplaceApplicator(),
  ) {
    super(project, model, logger, profile, defaultModelSettings, maxEditsPerAttempt);
  }

  protected async prepareEdit(context: ChangeCodeActionInput, edit: ChangeCodeEdit, source: string): Promise<ChangeCodePrepareResult> {
    const path = edit.path;
    let lastError: string | undefined;

    for (let editAttempt = 1; editAttempt <= this.maxEditAttempts; editAttempt += 1) {
      try {
        const response = await callModel<ReplaceFileResponse>(this.model, this.logger, {
          request: {
            message: editAttempt === 1
              ? 'Apply this concrete project edit using exact replacements.'
              : 'Repair the failed replacement against the current authoritative file.',
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
              `Use ${this.profile.language.nodus} for internal fields and preserve code identifiers exactly.`,
              `Use ${this.profile.language.project} for new human-authored project text unless the task explicitly requests another language.`,
              'Edit exactly the authoritative file supplied in DATA and return its project-root-relative path unchanged.',
              'Treat authoritativeSource.content as the only current source of truth.',
              'Return the smallest useful list of exact replacements. Do not return unified diff.',
              'For each replacement, copy before verbatim from authoritativeSource.content. Never reconstruct or paraphrase the before block.',
              'line is only a 1-based location hint. Correct before text matters more than the line number.',
              'Use one replacement for one contiguous changed region. Insertions can replace a stable anchor with anchor + inserted content; deletions use an empty after string.',
              'Do not include unchanged replacements and do not change unrelated code or documentation.',
            ].join('\n'),
          },
          response: { format: ModelResponseFormat.Json, schema: replaceSchema },
          settings: { maxTokens: 4096, ...this.defaultModelSettings, ...context.settings },
        });

        const responsePath = await this.project.resolvePath(response.path);
        if (responsePath !== path) {
          throw new Error(`Replace path mismatch: expected ${path}, received ${responsePath}`);
        }
        if (response.operations.length === 0) throw new Error(`Replace returned no operations for ${path}`);

        const content = this.applicator.apply(source, response.operations, path);
        if (editAttempt > 1) this.logger.info('worker.edit.recovered', { strategy: 'replace', path, editAttempt });
        return { status: 'completed', path, content };
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        this.logger.warn('worker.edit.error', {
          strategy: 'replace',
          path,
          editAttempt,
          maxEditAttempts: this.maxEditAttempts,
          error: lastError,
        });
      }
    }

    return {
      status: 'not-completed',
      reason: `Replace edit recovery limit reached (${this.maxEditAttempts}) for ${path}. Last error: ${lastError ?? 'unknown edit error'}`,
    };
  }
}
