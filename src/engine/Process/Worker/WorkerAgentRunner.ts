import type { EngineLogger } from '@engine/Type/EngineLogger.js';
import type { WorkerResult, WorkerRunData } from '@engine/Worker/Worker.js';
import type { WorkerPresentation } from '@engine/Presentation/WorkerPresentation.js';
import type { WorkerInstrument } from '@engine/Common/Instrument/ProcessInstrument.js';
import type { AgentRunner } from '@model/Runner/AgentRunner.js';
import type { Tool, ToolContext } from '@model/Tool/Tool.js';
import type { LanguageConfiguration } from '@engine/Type/LanguageConfiguration.js';
import { ModelLanguagePolicy } from '@engine/Language/ModelLanguagePolicy.js';

export interface sWorkerAgentOwner {
  id: string;
  presentation: WorkerPresentation;
}

/** Generic bounded agent execution used by automation-defined Agent Workers. */
export class WorkerAgentRunner {
  public constructor(
    private readonly agent: AgentRunner,
    private readonly tools: ReadonlyArray<Tool>,
    private readonly context: ToolContext,
    private readonly logger: EngineLogger,
    private readonly maxRounds = 12,
    private readonly language: LanguageConfiguration = { project: 'en', nodus: 'en', response: 'en' },
  ) {}

  public async run(
    owner: sWorkerAgentOwner,
    data: WorkerRunData,
    instrument: WorkerInstrument,
  ): Promise<WorkerResult> {
    const { task, step } = data;
    const { edit } = instrument;

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
          fileAccess: {
            read: (path) => edit.read(path),
            write: (path, content) => edit.write(path, content),
          },
        },
        maxRounds: this.maxRounds,
      });

      this.logger.info('worker.agent.finish', {
        workerId: owner.id,
        presentation: owner.presentation,
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
      this.logger.warn('worker.agent.interrupted', {
        workerId: owner.id,
        presentation: owner.presentation,
        taskId: task.id,
        stepId: step.id,
        reason,
      });
      return { status: 'not-completed', reason, canContinue: true };
    }
  }
}
