import type { EditStrategy} from "@engine/Process/Edit/EditStrategy.js";
import type { EditPreparationContext, EditPrepareResult} from "@engine/Process/Edit/EditTypes.js";
import type { EngineLogger } from '@engine/Type/EngineLogger.js';
import type { FileSystem } from '@engine/Common/Tools/FileSystem.js';
import { callModel } from '@model/Runner/ModelCaller.js';
import type { ModelRunner } from '@model/Runner/ModelRunner.js';
import { ModelLanguagePolicy} from "@engine/Common/Language/ModelLanguagePolicy.js";
import type { LanguageConfiguration } from '@engine/Type/LanguageConfiguration.js';
import { ModelRequestFormat } from '@model/Request/ModelRequestFormat.js';
import { ModelResponseFormat } from '@model/Response/ModelResponseFormat.js';
import type { ModelResponseSchema } from '@model/Response/ModelResponseSchema.js';

interface EditFileResponse { path: string; content: string }
const schema: ModelResponseSchema = { description: 'Complete resulting content for one authoritative file.', fields: { path: { type: 'string' }, content: { type: 'string' } } };

export class FullFileEditStrategy implements EditStrategy {
  public readonly id = 'edit' as const;
  public constructor(
    private readonly fileSystem: FileSystem,
    private readonly model: ModelRunner,
    private readonly logger: EngineLogger,
    private readonly language: LanguageConfiguration,
    private readonly guidance: string,
  ) {}

  public async prepare(context: EditPreparationContext): Promise<EditPrepareResult> {
    const path = context.edit.path;
    const response = await callModel<EditFileResponse>(this.model, this.editModelLogger(), {
      request: {
        message: 'Apply this concrete project edit by returning the complete resulting file.',
        data: { task: context.task.description, step: context.step, instruction: context.edit.instruction, authoritativeSource: { path, content: context.source } },
        format: ModelRequestFormat.Json,
        guidance: [
          this.guidance,
          ...new ModelLanguagePolicy(this.language).mixedProjectEdit(),
          'Edit exactly the authoritative file supplied in DATA and return its project-root-relative path unchanged.',
          'Treat authoritativeSource.content as the only current source of truth.',
          'Return the complete resulting file content, not a diff, fragment, explanation, or markdown fence.',
          'Preserve all unrelated source exactly and make only the requested edit.',
        ].join('\n'),
      },
      response: { format: ModelResponseFormat.Json, schema },
      settings: { maxTokens: 8192, ...context.settings },
    });
    const responsePath = await this.fileSystem.resolvePath(response.path);
    if (responsePath !== path) return { status: 'not-completed', reason: `Edit path mismatch: expected ${path}, received ${responsePath}` };
    return { status: 'completed', path, content: preserveEol(context.source, response.content), operations: 1 };
  }

  private editModelLogger(): EngineLogger {
    return {
      info: (event, data) => this.logger.info(`engine.edit.model.${event}`, data),
      warn: (event, data) => this.logger.warn(`engine.edit.model.${event}`, data),
      error: (event, data) => this.logger.error(`engine.edit.model.${event}`, data),
    };
  }
}

function preserveEol(source: string, content: string): string {
  if (!source.includes('\r\n')) return content.replace(/\r\n/g, '\n');
  return content.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
}
