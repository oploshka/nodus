import type { PlanStep } from '@engine/Planner/Plan.js';
import type { Task } from '@engine/Task/Task.js';
import type { EngineLogger } from '@engine/Type/EngineLogger.js';
import type { Worker, WorkerResult } from '@engine/Worker/Worker.js';
import type { AgentRunner } from '@model/Runner/AgentRunner.js';
import type { Tool, ToolContext } from '@model/Tool/Tool.js';
import type { LanguageConfiguration } from '@engine/Type/LanguageConfiguration.js';
import { WorkerPresentation } from '@engine/Presentation/WorkerPresentation.js';
import { ModelLanguagePolicy } from '@engine/Language/ModelLanguagePolicy.js';
import type { ProjectEditor } from '@engine/Edit/ProjectEditor.js';

/** General-purpose bounded agent loop. Specialized workers may outperform it. */
export class AgentWorker implements Worker {
  public readonly presentation = new WorkerPresentation({ name: { en: 'General agent', ru: 'Универсальный агент' } });
  public readonly name = this.presentation.name();
  public readonly id = 'agent';
  public readonly description = 'General-purpose autonomous coding agent with project tools. Useful when a specialized worker is not a clear fit.';

  public constructor(
    private readonly agent: AgentRunner,
    private readonly tools: ReadonlyArray<Tool>,
    private readonly context: ToolContext,
    private readonly logger: EngineLogger,
    private readonly maxRounds = 12,
    private readonly language: LanguageConfiguration = { project: 'en', nodus: 'en', response: 'en' },
  ) {}

  public canHandle(_step: PlanStep): boolean { return true; }

  public async run(task: Task, step: PlanStep, edit: ProjectEditor): Promise<WorkerResult> {
    try {
      const result = await this.agent.run({
        message: [
          `Original task: ${task.description}`,
          `Current task: ${step.goal}`,
          step.constraints.length > 0 ? `Constraints:\n- ${step.constraints.join('\n- ')}` : '',
          ModelLanguagePolicy.nodus(this.language.nodus),
          ModelLanguagePolicy.project(this.language.project),
          'Your final summary is consumed by Nodus and is therefore internal orchestration output, not a direct user response.',
        ].filter(Boolean).join('\n\n'),
        tools: this.tools,
        context: {
          ...this.context,
          // Agent sees the same task-local file state as specialized Workers.
          // Create/delete semantics remain intentionally outside Edit for now.
          fileAccess: {
            read: (path) => edit.read(path),
            write: (path, content) => edit.write(path, content),
          },
        },
        maxRounds: this.maxRounds,
      });

      this.logger.info('worker.agent.finish', {
        workerId: this.id,
        presentation: this.presentation,
        taskId: task.id,
        stepId: step.id,
        status: result.status,
        meta: result.meta,
      });

      return result.status === 'completed'
        ? { status: 'completed', summary: result.summary }
        : { status: 'not-completed', reason: result.reason, canContinue: true };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn('worker.agent.interrupted', { workerId: this.id, presentation: this.presentation, taskId: task.id, stepId: step.id, reason });
      return { status: 'not-completed', reason, canContinue: true };
    }
  }
}
