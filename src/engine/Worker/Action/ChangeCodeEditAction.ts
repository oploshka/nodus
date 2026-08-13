import {
  ChangeCodeAction,
  type ChangeCodeActionInput,
  type ChangeCodeActionProfile,
  type ChangeCodeApplyResult,
  type ChangeCodeEdit,
} from '@engine/Worker/Action/ChangeCodeAction.js';
import type { EngineLogger } from '@engine/Type/EngineLogger.js';
import type { Project } from '@engine/Project/Project.js';
import { callModel } from '@model/Runner/ModelCaller.js';
import type { ModelRunner } from '@model/Runner/ModelRunner.js';
import { ModelRequestFormat } from '@model/Request/ModelRequestFormat.js';
import { ModelResponseFormat } from '@model/Response/ModelResponseFormat.js';
import type { ModelResponseSchema } from '@model/Response/ModelResponseSchema.js';

interface EditFileResponse {
  path: string;
  content: string;
}

const editSchema: ModelResponseSchema = {
  description: 'Complete resulting content for one authoritative file.',
  fields: {
    path: { type: 'string', description: 'Project-root-relative path of the authoritative file.' },
    content: { type: 'string', description: 'Complete resulting file content after applying only the requested edit.' },
  },
};

/** Full-file rewrite strategy. Added as a high-context alternative; CodeWorker does not select it by default yet. */
export class ChangeCodeEditAction extends ChangeCodeAction {
  public readonly id = 'change-code-edit';
  public readonly description = 'Apply one coherent project/code change by returning complete resulting file contents.';

  public constructor(
    project: Project,
    model: ModelRunner,
    logger: EngineLogger,
    profile: ChangeCodeActionProfile,
    defaultModelSettings: ChangeCodeActionInput['settings'] = undefined,
    maxEditsPerAttempt = 6,
  ) {
    super(project, model, logger, profile, defaultModelSettings, maxEditsPerAttempt);
  }

  protected async applyEdit(context: ChangeCodeActionInput, edit: ChangeCodeEdit): Promise<ChangeCodeApplyResult> {
    const path = await this.project.resolvePath(edit.path);
    const source = await this.project.read(path);
    const response = await callModel<EditFileResponse>(this.model, this.logger, {
      request: {
        message: 'Apply this concrete project edit by returning the complete resulting file.',
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
          'Return the complete resulting file content, not a diff, fragment, explanation, or markdown fence.',
          'Preserve all unrelated source exactly and make only the requested edit.',
        ].join('\n'),
      },
      response: { format: ModelResponseFormat.Json, schema: editSchema },
      settings: { maxTokens: 8192, ...this.defaultModelSettings, ...context.settings },
    });

    const responsePath = await this.project.resolvePath(response.path);
    if (responsePath !== path) throw new Error(`Edit path mismatch: expected ${path}, received ${responsePath}`);
    const content = this.preserveEol(source, response.content);
    if (content === source) return { status: 'completed', changed: false, path };
    await this.project.write(path, content);
    return { status: 'completed', changed: true, path };
  }

  private preserveEol(source: string, content: string): string {
    if (!source.includes('\r\n')) return content.replace(/\r\n/g, '\n');
    return content.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
  }
}
