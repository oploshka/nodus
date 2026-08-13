import { RangeReplaceApplicator, type RangeReplaceOperation } from '@engine/Edit/Applicator/RangeReplaceApplicator.js';
import type { EditStrategy } from '@engine/Edit/EditStrategy.js';
import type { EditPreparationContext, EditPrepareResult } from '@engine/Edit/EditTypes.js';
import type { EngineLogger } from '@engine/Type/EngineLogger.js';
import type { Project } from '@engine/Project/Project.js';
import { callModel } from '@model/Runner/ModelCaller.js';
import type { ModelRunner } from '@model/Runner/ModelRunner.js';
import { ModelLanguagePolicy } from '@engine/Language/ModelLanguagePolicy.js';
import type { LanguageConfiguration } from '@engine/Type/LanguageConfiguration.js';
import { ModelRequestFormat } from '@model/Request/ModelRequestFormat.js';
import { ModelResponseFormat } from '@model/Response/ModelResponseFormat.js';
import type { ModelResponseSchema } from '@model/Response/ModelResponseSchema.js';
import { EditPresentation } from '@engine/Presentation/EditPresentation.js';

interface RangeReplaceFileResponse { path: string; operations: RangeReplaceOperation[] }

const schema: ModelResponseSchema = {
  description: 'Small guarded line-range replacements for one authoritative file.',
  fields: {
    path: { type: 'string', description: 'Project-root-relative path of the authoritative file.' },
    operations: { type: 'array', items: { type: 'object', fields: {
      startLine: { type: 'number' }, endLine: { type: 'number' }, expected: { type: 'string' }, replacement: { type: 'string' },
    } } },
  },
};

export class RangeReplaceEditStrategy implements EditStrategy {
  public readonly id = 'range-replace' as const;
  private readonly presentation = new EditPresentation();
  public constructor(
    private readonly project: Project,
    private readonly model: ModelRunner,
    private readonly logger: EngineLogger,
    private readonly language: LanguageConfiguration,
    private readonly guidance: string,
    private readonly maxEditAttempts = 2,
    private readonly applicator = new RangeReplaceApplicator(),
  ) {}

  public async prepare(context: EditPreparationContext): Promise<EditPrepareResult> {
    const path = context.edit.path;
    let lastError: string | undefined;
    let previousOperations: RangeReplaceOperation[] | undefined;

    for (let attempt = 1; attempt <= this.maxEditAttempts; attempt += 1) {
      try {
        const response = await callModel<RangeReplaceFileResponse>(this.model, this.editModelLogger(), {
          request: {
            message: attempt === 1
              ? 'Prepare minimal guarded line-range replacements for this project edit.'
              : 'Repair only the failed range-replace localization against the current authoritative file.',
            data: {
              task: context.task.description,
              step: context.step,
              instruction: context.edit.instruction,
              authoritativeSource: { path, content: context.source },
              recovery: attempt === 1 ? undefined : {
                attempt,
                previousError: lastError,
                previousOperations,
              },
            },
            format: ModelRequestFormat.Json,
            guidance: [
              this.guidance,
              ...new ModelLanguagePolicy(this.language).mixedProjectEdit(),
              'Edit exactly the authoritative file supplied in DATA and return its project-root-relative path unchanged.',
              'Treat authoritativeSource.content as the only current source of truth.',
              'The semantic edit instruction is already accepted. Do not broaden, reinterpret, or redesign it.',
              attempt === 1
                ? 'Return the smallest changed line ranges; do not return unified diff and do not return the complete file.'
                : 'The previous operation could not be applied. Keep the same semantic change and only make the location/expected context more specific and unambiguous.',
              'For expected, copy only exact text from authoritativeSource.content.',
              'Prefer one-line expected ranges when one line is enough; when context is ambiguous, include the smallest additional neighboring lines needed to identify one location.',
              'startLine/endLine are location hints. expected must match authoritativeSource.content exactly.',
              'For insertion, replace one stable existing line with that same line plus the inserted content.',
              'Do not include unchanged operations and do not change unrelated content.',
            ].join('\n'),
          },
          response: { format: ModelResponseFormat.Json, schema },
          settings: { maxTokens: 4096, ...context.settings },
        });
        previousOperations = response.operations;
        const responsePath = await this.project.resolvePath(response.path);
        if (responsePath !== path) throw new Error(`Range replace path mismatch: expected ${path}, received ${responsePath}`);
        if (response.operations.length === 0) throw new Error(`Range replace returned no operations for ${path}`);
        const content = this.applicator.apply(context.source, response.operations, path);
        if (attempt > 1) this.logger.info('engine.edit.strategy.recovered', { strategy: this.id, path, editAttempt: attempt, presentation: this.presentation });
        return { status: 'completed', path, content, operations: response.operations.length };
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        if (attempt < this.maxEditAttempts) {
          this.logger.warn('engine.edit.strategy.retry', {
            strategy: this.id,
            path,
            editAttempt: attempt,
            maxEditAttempts: this.maxEditAttempts,
            error: lastError,
            presentation: this.presentation,
          });
        }
      }
    }

    return {
      status: 'not-completed',
      reason: `Range replace recovery limit reached (${this.maxEditAttempts}) for ${path}. Last error: ${lastError ?? 'unknown edit error'}`,
    };
  }

  private editModelLogger(): EngineLogger {
    return {
      info: (event, data) => this.logger.info(`engine.edit.model.${event}`, data),
      warn: (event, data) => this.logger.warn(`engine.edit.model.${event}`, data),
      error: (event, data) => this.logger.error(`engine.edit.model.${event}`, data),
    };
  }
}
