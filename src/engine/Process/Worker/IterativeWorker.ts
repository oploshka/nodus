import type { EngineLogger } from '@engine/Type/EngineLogger.js';
import type { PlanStep } from '@engine/Planner/Plan.js';
import type { ResearchAnswer } from '@engine/Research/ResearchTypes.js';
import type { ChangeCodeActionData, ChangeCodeActionInput, tChangeCodeActionRequest } from '@engine/Worker/Action/ChangeCodeAction.js';
import type { ResearchActionInput } from '@engine/Worker/Action/ResearchAction.js';
import type { sReadProjectActionInput } from '@engine/Worker/Action/ReadProjectAction.js';
import type { sSearchProjectActionInput } from '@engine/Worker/Action/SearchProjectAction.js';
import type { WorkerAction } from '@engine/Worker/Action/WorkerAction.js';
import type { Worker, WorkerResult, WorkerRunData } from '@engine/Worker/Worker.js';
import type { WorkerPresentation } from '@engine/Presentation/WorkerPresentation.js';
import type { ModelRunSettings } from '@model/Request/ModelRun.js';
import type { WorkerInstrument } from '@engine/Common/Instrument/ProcessInstrument.js';
import type { sWorkerReadContext, sWorkerSearchContext, tWorkerContextItem } from '@engine/Worker/WorkerContext.js';

interface WorkerSession {
  context: tWorkerContextItem[];
}

export interface IterativeWorkerModelSettings {
  primary?: ModelRunSettings;
  research?: ModelRunSettings;
}

/**
 * Shared Worker lifecycle. Direct Search/Read retrieval is preferred for cheap project facts.
 * Research remains a separately bounded expensive analysis operation.
 */
export abstract class IterativeWorker implements Worker {
  public abstract readonly id: string;
  public abstract readonly presentation: WorkerPresentation;
  public abstract readonly name: string;
  public abstract readonly description: string;
  public readonly actions: ReadonlyArray<{ id: string; presentation: unknown; description: string }>;

  private readonly sessions = new Map<string, WorkerSession>();

  protected constructor(
    private readonly primaryAction: WorkerAction<ChangeCodeActionInput, ChangeCodeActionData, tChangeCodeActionRequest>,
    private readonly readAction: WorkerAction<sReadProjectActionInput, sWorkerReadContext>,
    private readonly searchAction: WorkerAction<sSearchProjectActionInput, sWorkerSearchContext>,
    private readonly researchAction: WorkerAction<ResearchActionInput, ResearchAnswer>,
    private readonly logger: EngineLogger,
    private readonly maxAttempts = 4,
    private readonly maxResearchRequests = 4,
    private readonly maxRetrievalRequests = 6,
    private readonly modelSettings: IterativeWorkerModelSettings = {},
  ) {
    this.actions = [primaryAction, searchAction, readAction, researchAction];
  }

  public canHandle(_step: PlanStep): boolean { return true; }

  public async run(data: WorkerRunData, instrument: WorkerInstrument): Promise<WorkerResult> {
    const { task, step } = data;
    const { edit } = instrument;
    const sessionKey = `${task.id}:${step.id}`;
    const session = this.sessions.get(sessionKey) ?? { context: [] };
    this.sessions.set(sessionKey, session);

    let attempts = 0;
    let researchRequests = 0;
    let retrievalRequests = 0;
    let lastAttemptError: string | undefined;

    this.logger.info('worker.start', {
      workerId: this.id,
      workerName: this.name,
      presentation: this.presentation,
      taskId: task.id,
      stepId: step.id,
      actions: this.actions.map((action) => action.id),
      contextItems: session.context.length,
    });

    while (attempts < this.maxAttempts) {
      attempts += 1;
      let result;
      try {
        this.logActionStart(this.primaryAction, step.id, { attempt: attempts });
        result = await this.primaryAction.run({ task, step, context: session.context, settings: this.modelSettings.primary });
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

      this.logActionFinish(this.primaryAction, step.id, result);

      if (result.status === 'completed') {
        if (result.data.edit) {
          const editResult = await edit.change(task, step, result.data.edit);
          if (editResult.status === 'not-completed') return { status: 'not-completed', reason: editResult.reason, canContinue: true };
        }
        this.sessions.delete(sessionKey);
        return { status: 'completed', summary: result.data.summary };
      }
      if (result.status === 'failed') {
        this.sessions.delete(sessionKey);
        return { status: 'failed', reason: result.reason, canContinue: false };
      }

      const requests = result.requests ?? [];
      if (requests.length === 0) return { status: 'not-completed', reason: result.reason, canContinue: true };

      let progress = false;
      for (const request of requests) {
        if (request.actionId === this.searchAction.id) {
          const input = request.input as sSearchProjectActionInput;
          if (this.hasSearch(session.context, input.query)) continue;
          if (retrievalRequests >= this.maxRetrievalRequests) return { status: 'not-completed', reason: `Worker retrieval request limit reached (${this.maxRetrievalRequests}).`, canContinue: true };
          retrievalRequests += 1;
          this.logActionStart(this.searchAction, step.id, { requestIndex: retrievalRequests, query: input.query });
          const searched = await this.searchAction.run(input);
          this.logActionFinish(this.searchAction, step.id, searched);
          if (searched.status === 'failed') return { status: 'failed', reason: searched.reason, canContinue: false };
          if (searched.status === 'not-completed') return { status: 'not-completed', reason: searched.reason, canContinue: true };
          session.context.push(searched.data);
          progress = true;
          continue;
        }

        if (request.actionId === this.readAction.id) {
          const input = request.input as { path: string };
          if (this.hasRead(session.context, input.path)) continue;
          if (retrievalRequests >= this.maxRetrievalRequests) return { status: 'not-completed', reason: `Worker retrieval request limit reached (${this.maxRetrievalRequests}).`, canContinue: true };
          retrievalRequests += 1;
          this.logActionStart(this.readAction, step.id, { requestIndex: retrievalRequests, path: input.path });
          const read = await this.readAction.run({ path: input.path, readFile: (path) => edit.read(path) });
          this.logActionFinish(this.readAction, step.id, read);
          if (read.status === 'failed') return { status: 'failed', reason: read.reason, canContinue: false };
          if (read.status === 'not-completed') return { status: 'not-completed', reason: read.reason, canContinue: true };
          session.context.push(read.data);
          progress = true;
          continue;
        }

        if (request.actionId === this.researchAction.id) {
          const input = request.input as { question: string };
          if (this.hasResearch(session.context, input.question)) continue;
          if (researchRequests >= this.maxResearchRequests) return { status: 'not-completed', reason: `Worker research request limit reached (${this.maxResearchRequests}).`, canContinue: true };
          researchRequests += 1;
          this.logActionStart(this.researchAction, step.id, { requestIndex: researchRequests, maxRequests: this.maxResearchRequests, question: input.question });
          const researched = await this.researchAction.run({ question: input.question, settings: this.modelSettings.research, readFile: (path) => edit.read(path) });
          this.logActionFinish(this.researchAction, step.id, researched);
          if (researched.status === 'failed') return { status: 'failed', reason: researched.reason, canContinue: false };
          if (researched.status === 'not-completed') return { status: 'not-completed', reason: researched.reason, canContinue: true };
          session.context.push({ kind: 'research', value: researched.data });
          progress = true;
        }
      }

      if (!progress) return { status: 'not-completed', reason: 'Worker requested context that is already available and made no progress.', canContinue: true };
    }

    return {
      status: 'not-completed',
      reason: lastAttemptError ? `Worker attempt limit reached (${this.maxAttempts}). Last action error: ${lastAttemptError}` : `Worker attempt limit reached (${this.maxAttempts}).`,
      canContinue: true,
    };
  }

  private hasSearch(context: ReadonlyArray<tWorkerContextItem>, query: string): boolean {
    return context.some((item) => item.kind === 'search' && item.query.trim() === query.trim());
  }

  private hasRead(context: ReadonlyArray<tWorkerContextItem>, path: string): boolean {
    return context.some((item) => item.kind === 'read' && item.path.trim() === path.trim());
  }

  private hasResearch(context: ReadonlyArray<tWorkerContextItem>, question: string): boolean {
    return context.some((item) => item.kind === 'research' && item.value.question.trim() === question.trim());
  }

  private logActionStart(action: { id: string; name?: string; method?: string; presentation: unknown }, stepId: string, data: Record<string, unknown>): void {
    this.logger.info('worker.action.start', { workerId: this.id, stepId, actionId: action.id, actionName: action.name, actionMethod: action.method, actionPresentation: action.presentation, ...data });
  }

  private logActionFinish(action: { id: string; name?: string; presentation: unknown }, stepId: string, result: unknown): void {
    this.logger.info('worker.action.finish', { workerId: this.id, stepId, actionId: action.id, actionName: action.name, actionPresentation: action.presentation, result });
  }
}
