import { EditApplicatorReplace, type ReplaceOperation } from '@engine/Process/Edit/Applicator/EditApplicatorReplace.js';
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

interface ReplaceFileResponse { path: string; operations: ReplaceOperation[] }
const schema: ModelResponseSchema = { description: 'Exact guarded replacements for one authoritative file.', fields: { path: { type: 'string' }, operations: { type: 'array', items: { type: 'object', fields: { line: { type: 'number' }, before: { type: 'string' }, after: { type: 'string' } } } } } };

export class EditStrategyReplace implements EditStrategy {
  public readonly id = 'replace' as const;
  public constructor(
    private readonly fileSystem: FileSystem,
    private readonly model: ModelRunner,
    private readonly language: LanguageConfiguration,
    private readonly guidance: string,
    private readonly maxEditAttempts = 2,
    private readonly applicator = new EditApplicatorReplace(),
  ) {}

  public async prepare(context: EditPreparationContext): Promise<EditPrepareResult> {
    const path = context.edit.path;
    let lastError: string | undefined;
    for (let attempt = 1; attempt <= this.maxEditAttempts; attempt += 1) {
      try {
        const response = await callModel<ReplaceFileResponse>(this.model, context.emit, {
          request: {
            message: attempt === 1 ? 'Apply this concrete project edit using exact replacements.' : 'Repair the failed replacement against the current authoritative file.',
            data: { task: context.task.description, step: context.step, instruction: context.edit.instruction, authoritativeSource: { path, content: context.source }, recovery: attempt === 1 ? undefined : { attempt, previousError: lastError } },
            format: ModelRequestFormat.Json,
            guidance: [
              this.guidance,
              ...new ModelLanguagePolicy(this.language).mixedProjectEdit(),
              'Edit exactly the authoritative file supplied in DATA and return its project-root-relative path unchanged.',
              'Treat authoritativeSource.content as the only current source of truth.',
              'Return the smallest useful list of exact replacements. Do not return unified diff.',
              'For each replacement, copy before verbatim from authoritativeSource.content.',
              'line is only a location hint. Correct before text matters more than the line number.',
              'Do not include unchanged replacements and do not change unrelated content.',
            ].join('\n'),
          },
          response: { format: ModelResponseFormat.Json, schema },
          settings: { maxTokens: 4096, ...context.settings },
        });
        const responsePath = await this.fileSystem.resolvePath(response.path);
        if (responsePath !== path) throw new Error(`Replace path mismatch: expected ${path}, received ${responsePath}`);
        if (response.operations.length === 0) throw new Error(`Replace returned no operations for ${path}`);
        return { status: 'completed', path, content: this.applicator.apply(context.source, response.operations, path), operations: response.operations.length };
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
    return { status: 'not-completed', reason: `Replace edit recovery limit reached (${this.maxEditAttempts}) for ${path}. Last error: ${lastError ?? 'unknown edit error'}` };
  }
}
