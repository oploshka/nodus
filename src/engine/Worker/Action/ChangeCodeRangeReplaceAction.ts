import {
  ChangeCodeAction,
  type ChangeCodeActionInput,
  type ChangeCodeActionProfile,
  type ChangeCodeEdit,
  type ChangeCodePrepareResult,
} from '@engine/Worker/Action/ChangeCodeAction.js';
import { RangeReplaceApplicator, type RangeReplaceOperation } from '@engine/Worker/Edit/RangeReplaceApplicator.js';
import type { EngineLogger } from '@engine/Type/EngineLogger.js';
import type { Project } from '@engine/Project/Project.js';
import { callModel } from '@model/Runner/ModelCaller.js';
import type { ModelRunner } from '@model/Runner/ModelRunner.js';
import { ActionPresentation } from '@engine/Presentation/ActionPresentation.js';
import { ModelRequestFormat } from '@model/Request/ModelRequestFormat.js';
import { ModelResponseFormat } from '@model/Response/ModelResponseFormat.js';
import type { ModelResponseSchema } from '@model/Response/ModelResponseSchema.js';

interface RangeReplaceFileResponse {
  path: string;
  operations: RangeReplaceOperation[];
}

const rangeReplaceSchema: ModelResponseSchema = {
  description: 'Small guarded line-range replacements for one authoritative file.',
  fields: {
    path: { type: 'string', description: 'Project-root-relative path of the authoritative file.' },
    operations: {
      type: 'array',
      description: 'Minimal changed ranges. Repeat only the small exact range being changed.',
      items: {
        type: 'object',
        fields: {
          startLine: { type: 'number', description: 'Approximate 1-based inclusive start line.' },
          endLine: { type: 'number', description: 'Approximate 1-based inclusive end line.' },
          expected: { type: 'string', description: 'Exact current text for only this small range.' },
          replacement: { type: 'string', description: 'Complete replacement text for this range. Empty string deletes it.' },
        },
      },
    },
  },
};

/** Primary replace experiment: small guarded ranges instead of large before blocks. */
export class ChangeCodeRangeReplaceAction extends ChangeCodeAction {
  public readonly id = 'change-code-range-replace';
  public readonly presentation = new ActionPresentation({
    name: { en: 'Code change', ru: 'Изменение кода' },
    detail: 'range-replace',
  });
  public readonly name = this.presentation.name();
  public readonly method = this.presentation.detail();
  public readonly description = 'Apply coherent project/code changes using small guarded line-range replacements.';

  public constructor(
    project: Project,
    model: ModelRunner,
    logger: EngineLogger,
    profile: ChangeCodeActionProfile,
    defaultModelSettings: ChangeCodeActionInput['settings'] = undefined,
    maxEditsPerAttempt = 6,
    private readonly applicator = new RangeReplaceApplicator(),
  ) {
    super(project, model, logger, profile, defaultModelSettings, maxEditsPerAttempt);
  }

  protected async prepareEdit(
    context: ChangeCodeActionInput,
    edit: ChangeCodeEdit,
    source: string,
  ): Promise<ChangeCodePrepareResult> {
    const path = edit.path;
    this.logger.info('worker.edit.prepare.start', { strategy: 'range-replace', path, presentation: this.editPresentation });

    try {
      const response = await callModel<RangeReplaceFileResponse>(this.model, this.editModelLogger(), {
        request: {
          message: 'Prepare minimal guarded line-range replacements for this project edit.',
          data: {
            task: context.task.description,
            step: context.step,
            instruction: edit.instruction,
            knowledge: context.knowledge.map((item) => ({ question: item.question, status: item.status, answer: item.answer })),
            authoritativeSource: { path, content: source },
          },
          format: ModelRequestFormat.Json,
          guidance: [
            this.profile.guidance,
            `Use ${this.profile.language.nodus} for internal fields and preserve code identifiers exactly.`,
            `Use ${this.profile.language.project} for new human-authored project text unless the task explicitly requests another language.`,
            'Edit exactly the authoritative file supplied in DATA and return its project-root-relative path unchanged.',
            'Treat authoritativeSource.content as the only current source of truth.',
            'Return the smallest changed line ranges; do not return unified diff and do not return the complete file.',
            'For expected, copy only the exact small current range that will be replaced. Do not copy a surrounding class/function merely for context.',
            'Prefer one-line expected ranges when one line is enough to express the change safely.',
            'startLine/endLine are only location hints. expected must match authoritativeSource.content exactly.',
            'For insertion, replace one stable existing line with that same line plus the inserted content.',
            'Do not include unchanged operations and do not change unrelated code or documentation.',
          ].join('\n'),
        },
        response: { format: ModelResponseFormat.Json, schema: rangeReplaceSchema },
        settings: { maxTokens: 4096, ...this.defaultModelSettings, ...context.settings },
      });

      const responsePath = await this.project.resolvePath(response.path);
      if (responsePath !== path) throw new Error(`Range replace path mismatch: expected ${path}, received ${responsePath}`);
      if (response.operations.length === 0) throw new Error(`Range replace returned no operations for ${path}`);

      const content = this.applicator.apply(source, response.operations, path);
      this.logger.info('worker.edit.prepare.finish', { strategy: 'range-replace', path, operations: response.operations.length, presentation: this.editPresentation });
      return { status: 'completed', path, content };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn('worker.edit.prepare.failed', { strategy: 'range-replace', path, reason, presentation: this.editPresentation });
      return { status: 'not-completed', reason: `Range replace could not prepare ${path}: ${reason}` };
    }
  }

  private editModelLogger(): EngineLogger {
    return {
      info: (event, data) => this.logger.info(`worker.edit.model.${event}`, data),
      warn: (event, data) => this.logger.warn(`worker.edit.model.${event}`, data),
      error: (event, data) => this.logger.error(`worker.edit.model.${event}`, data),
    };
  }
}
