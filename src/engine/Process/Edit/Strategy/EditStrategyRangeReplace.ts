import { EditApplicatorRangeReplace, type RangeReplaceOperation } from '@engine/Process/Edit/Applicator/EditApplicatorRangeReplace.js';
import type { EditStrategy } from '@engine/Process/Edit/EditStrategy.js';
import type { EditPreparationContext, EditPrepareResult } from '@engine/Process/Edit/EditTypes.js';
import type { FileSystem } from '@engine/Common/Tools/FileSystem.js';
import { callModel } from '@model/Runner/ModelCaller.js';
import type { ModelRunner } from '@model/Runner/ModelRunner.js';
import { ModelLanguagePolicy } from '@engine/Common/Language/ModelLanguagePolicy.js';
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

export class EditStrategyRangeReplace implements EditStrategy {
  public readonly id = 'range-replace' as const;
  public constructor(
    private readonly fileSystem: FileSystem,
    private readonly model: ModelRunner,
    private readonly language: LanguageConfiguration,
    private readonly guidance: string,
    private readonly maxEditAttempts = 2,
    private readonly applicator = new EditApplicatorRangeReplace(),
  ) {}

  public async prepare(context: EditPreparationContext): Promise<EditPrepareResult> {
    const path = context.edit.path;
    let lastError: string | undefined;
    let previousOperations: RangeReplaceOperation[] | undefined;

    for (let attempt = 1; attempt <= this.maxEditAttempts; attempt += 1) {
      try {
        const response = await callModel<RangeReplaceFileResponse>(this.model, context.emit, {
          request: {
            message: attempt === 1
              ? 'Prepare minimal guarded line-range replacements for this project edit.'
              : 'Repair only the failed range-replace localization against the current authoritative file.',
            data: {
              task: context.task.description,
              step: context.step,
              instruction: context.edit.instruction,
              authoritativeSource: { path, content: context.source },
              recovery: attempt === 1 ? undefined : { attempt, previousError: lastError, previousOperations },
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
        const responsePath = await this.fileSystem.resolvePath(response.path);
        if (responsePath !== path) throw new Error(`Range replace path mismatch: expected ${path}, received ${responsePath}`);
        if (response.operations.length === 0) throw new Error(`Range replace returned no operations for ${path}`);
        const content = this.applicator.apply(context.source, response.operations, path);
        if (attempt > 1) {
          context.emit({ type: 'edit.strategy.recovered', data: { strategy: this.id, path, editAttempt: attempt } });
        }
        return { status: 'completed', path, content, operations: response.operations.length };
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        if (attempt < this.maxEditAttempts) {
          context.emit({
            type: 'edit.strategy.retry',
            level: 'warning',
            data: { strategy: this.id, path, editAttempt: attempt, maxEditAttempts: this.maxEditAttempts, error: lastError },
          });
        }
      }
    }

    return { status: 'not-completed', reason: `Range replace recovery limit reached (${this.maxEditAttempts}) for ${path}. Last error: ${lastError ?? 'unknown edit error'}` };
  }
}
