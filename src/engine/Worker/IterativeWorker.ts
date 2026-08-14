import type { EngineLogger } from '@engine/Type/EngineLogger.js';
import type { PlanStep } from '@engine/Planner/Plan.js';
import type { ResearchAnswer } from '@engine/Research/ResearchTypes.js';
import type { Task } from '@engine/Task/Task.js';
import type { ChangeCodeActionData, ChangeCodeActionInput, ResearchActionRequest } from '@engine/Worker/Action/ChangeCodeAction.js';
import type { ResearchActionInput } from '@engine/Worker/Action/ResearchAction.js';
import type { WorkerAction } from '@engine/Worker/Action/WorkerAction.js';
import type { Worker, WorkerResult } from '@engine/Worker/Worker.js';
import type { WorkerPresentation } from '@engine/Presentation/WorkerPresentation.js';
import type { ModelRunSettings } from '@model/Request/ModelRun.js';
import type { ProjectEditor } from '@engine/Edit/ProjectEditor.js';

interface WorkerSession {
  knowledge: ResearchAnswer[];
}

export interface IterativeWorkerModelSettings {
  primary?: ModelRunSettings;
  research?: ModelRunSettings;
}

/**
 * Shared Worker lifecycle. The Worker starts by executing its primary Action.
 * Research is invoked only when that Action explicitly requests concrete facts.
 */
export abstract class IterativeWorker implements Worker {
  public abstract readonly id: string;
  public abstract readonly presentation: WorkerPresentation;
  public abstract readonly name: string;
  public abstract readonly description: string;
  public readonly actions: ReadonlyArray<{ id: string; presentation: unknown; description: string }>;

  private readonly sessions = new Map<string, WorkerSession>();

  protected constructor(
    private readonly primaryAction: WorkerAction<ChangeCodeActionInput, ChangeCodeActionData, ResearchActionRequest>,
    private readonly researchAction: WorkerAction<ResearchActionInput, ResearchAnswer>,
    private readonly logger: EngineLogger,
    private readonly maxAttempts = 4,
    private readonly maxResearchRequests = 4,
    private readonly modelSettings: IterativeWorkerModelSettings = {},
  ) {
    this.actions = [primaryAction, researchAction];
  }

  public canHandle(_step: PlanStep): boolean { return true; }

  public async run(task: Task, step: PlanStep, edit: ProjectEditor): Promise<WorkerResult> {
    const sessionKey = `${task.id}:${step.id}`;
    const session = this.sessions.get(sessionKey) ?? { knowledge: [] };
    this.sessions.set(sessionKey, session);

    let attempts = 0;
    let researchRequests = 0;
    let lastAttemptError: string | undefined;

    this.logger.info('worker.start', {
      workerId: this.id,
      workerName: this.name,
      presentation: this.presentation,
      taskId: task.id,
      stepId: step.id,
      actions: this.actions.map((action) => action.id),
      knownAnswers: session.knowledge.length,
    });

    while (attempts < this.maxAttempts) {
      attempts += 1;
      let result;
      try {
        this.logger.info('worker.action.start', {
          workerId: this.id,
          stepId: step.id,
          actionId: this.primaryAction.id,
          actionName: this.primaryAction.name,
          actionMethod: this.primaryAction.method,
          actionPresentation: this.primaryAction.presentation,
          attempt: attempts,
        });
        result = await this.primaryAction.run({
          task,
          step,
          knowledge: session.knowledge,
          settings: this.modelSettings.primary,
        });
        lastAttemptError = undefined;
      } catch (error) {
        lastAttemptError = error instanceof Error ? error.message : String(error);
        this.logger.warn('worker.action.error', {
          workerId: this.id,
          stepId: step.id,
          actionId: this.primaryAction.id,
          actionName: this.primaryAction.name,
          actionMethod: this.primaryAction.method,
          actionPresentation: this.primaryAction.presentation,
          attempt: attempts,
          error: lastAttemptError,
        });
        continue;
      }

      this.logger.info('worker.action.finish', {
        workerId: this.id,
        stepId: step.id,
        actionId: this.primaryAction.id,
        actionName: this.primaryAction.name,
        actionMethod: this.primaryAction.method,
        actionPresentation: this.primaryAction.presentation,
        attempt: attempts,
        result,
      });

      if (result.status === 'completed') {
        if (result.data.edit) {
          const editResult = await edit.change(task, step, result.data.edit);
          if (editResult.status === 'not-completed') {
            return { status: 'not-completed', reason: editResult.reason, canContinue: true };
          }
        }
        this.sessions.delete(sessionKey);
        return { status: 'completed', summary: result.data.summary };
      }

      if (result.status === 'failed') {
        this.sessions.delete(sessionKey);
        return { status: 'failed', reason: result.reason, canContinue: false };
      }

      const requests = (result.requests ?? []).filter((request) => request.actionId === this.researchAction.id);
      if (requests.length === 0) {
        return { status: 'not-completed', reason: result.reason, canContinue: true };
      }

      const knownQuestions = new Set(session.knowledge.map((item) => item.question.trim()));
      const questions = Array.from(new Set(
        requests
          .map((request) => request.input.question.trim())
          .filter(Boolean),
      )).filter((question) => !knownQuestions.has(question));

      if (questions.length === 0) {
        return {
          status: 'not-completed',
          reason: 'Worker requested Research that is already available and made no progress.',
          canContinue: true,
        };
      }

      for (const question of questions) {
        if (researchRequests >= this.maxResearchRequests) {
          return {
            status: 'not-completed',
            reason: `Worker research request limit reached (${this.maxResearchRequests}).`,
            canContinue: true,
          };
        }

        researchRequests += 1;
        this.logger.info('worker.action.start', {
          workerId: this.id,
          stepId: step.id,
          actionId: this.researchAction.id,
          actionName: this.researchAction.name,
          actionPresentation: this.researchAction.presentation,
          requestIndex: researchRequests,
          maxRequests: this.maxResearchRequests,
          question,
        });
        const researchResult = await this.researchAction.run({
          question,
          settings: this.modelSettings.research,
          readFile: (path) => edit.read(path),
        });
        this.logger.info('worker.action.finish', {
          workerId: this.id,
          stepId: step.id,
          actionId: this.researchAction.id,
          actionName: this.researchAction.name,
          actionPresentation: this.researchAction.presentation,
          result: researchResult,
        });

        if (researchResult.status === 'failed') {
          return { status: 'failed', reason: researchResult.reason, canContinue: false };
        }
        if (researchResult.status === 'not-completed') {
          return { status: 'not-completed', reason: researchResult.reason, canContinue: true };
        }
        session.knowledge.push(researchResult.data);
      }
    }

    return {
      status: 'not-completed',
      reason: lastAttemptError
        ? `Worker attempt limit reached (${this.maxAttempts}). Last action error: ${lastAttemptError}`
        : `Worker attempt limit reached (${this.maxAttempts}).`,
      canContinue: true,
    };
  }
}
