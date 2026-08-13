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
  public constructor(
    private readonly project: Project,
    private readonly model: ModelRunner,
    private readonly logger: EngineLogger,
    private readonly language: LanguageConfiguration,
    private readonly guidance: string,
    private readonly applicator = new RangeReplaceApplicator(),
  ) {}

  public async prepare(context: EditPreparationContext): Promise<EditPrepareResult> {
    const path = context.edit.path;
    try {
      const response = await callModel<RangeReplaceFileResponse>(this.model, this.editModelLogger(), {
        request: {
          message: 'Prepare minimal guarded line-range replacements for this project edit.',
          data: { task: context.task.description, step: context.step, instruction: context.edit.instruction, authoritativeSource: { path, content: context.source } },
          format: ModelRequestFormat.Json,
          guidance: [
            this.guidance,
            ...new ModelLanguagePolicy(this.language).mixedProjectEdit(),
            'Edit exactly the authoritative file supplied in DATA and return its project-root-relative path unchanged.',
            'Treat authoritativeSource.content as the only current source of truth.',
            'Return the smallest changed line ranges; do not return unified diff and do not return the complete file.',
            'For expected, copy only the exact small current range that will be replaced.',
            'Prefer one-line expected ranges when one line is enough to express the change safely.',
            'startLine/endLine are location hints. expected must match authoritativeSource.content exactly.',
            'For insertion, replace one stable existing line with that same line plus the inserted content.',
            'Do not include unchanged operations and do not change unrelated content.',
          ].join('\n'),
        },
        response: { format: ModelResponseFormat.Json, schema },
        settings: { maxTokens: 4096, ...context.settings },
      });
      const responsePath = await this.project.resolvePath(response.path);
      if (responsePath !== path) throw new Error(`Range replace path mismatch: expected ${path}, received ${responsePath}`);
      if (response.operations.length === 0) throw new Error(`Range replace returned no operations for ${path}`);
      return { status: 'completed', path, content: this.applicator.apply(context.source, response.operations, path), operations: response.operations.length };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return { status: 'not-completed', reason: `Range replace could not prepare ${path}: ${reason}` };
    }
  }

  private editModelLogger(): EngineLogger {
    return {
      info: (event, data) => this.logger.info(`engine.edit.model.${event}`, data),
      warn: (event, data) => this.logger.warn(`engine.edit.model.${event}`, data),
      error: (event, data) => this.logger.error(`engine.edit.model.${event}`, data),
    };
  }
}
