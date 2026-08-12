import type { EngineLogger } from '@engine/Type/EngineLogger.js';
import type { PlanStep } from '@engine/Planner/Plan.js';
import type { Research } from '@engine/Research/Research.js';
import type { ResearchAnswer } from '@engine/Research/ResearchTypes.js';
import type { Task } from '@engine/Task/Task.js';
import type { WorkerAttempt, WorkerAttemptResult } from '@engine/Worker/Attempt/WorkerAttempt.js';
import type { Worker, WorkerResult } from '@engine/Worker/Worker.js';

interface WorkerSession {
  knowledge: ResearchAnswer[];
}

/**
 * Shared Worker lifecycle: execute first, research only concrete missing facts,
 * then execute the same task again. Engine never sees this local loop.
 */
export abstract class IterativeWorker implements Worker {
  public abstract readonly id: string;
  public abstract readonly description: string;

  private readonly sessions = new Map<string, WorkerSession>();

  protected constructor(
    private readonly attempt: WorkerAttempt,
    private readonly research: Pick<Research, 'ask'>,
    private readonly logger: EngineLogger,
    private readonly maxAttempts = 4,
    private readonly maxResearchRequests = 4,
  ) {}

  public canHandle(_step: PlanStep): boolean { return true; }

  public async run(task: Task, step: PlanStep): Promise<WorkerResult> {
    const sessionKey = `${task.id}:${step.id}`;
    const session = this.sessions.get(sessionKey) ?? { knowledge: [] };
    this.sessions.set(sessionKey, session);

    let attempts = 0;
    let researchRequests = 0;
    let lastAttemptError: string | undefined;

    this.logger.info('worker.start', {
      workerId: this.id,
      taskId: task.id,
      stepId: step.id,
      knownAnswers: session.knowledge.length,
    });

    while (attempts < this.maxAttempts) {
      attempts += 1;
      let result: WorkerAttemptResult;
      try {
        result = await this.attempt.execute({ task, step, knowledge: session.knowledge });
        lastAttemptError = undefined;
      } catch (error) {
        lastAttemptError = error instanceof Error ? error.message : String(error);
        this.logger.warn('worker.attempt.error', {
          workerId: this.id,
          stepId: step.id,
          attempt: attempts,
          error: lastAttemptError,
        });
        continue;
      }

      this.logger.info('worker.attempt', { workerId: this.id, stepId: step.id, attempt: attempts, result });

      if (result.status === 'completed') {
        this.sessions.delete(sessionKey);
        return { status: 'completed', summary: result.summary };
      }

      if (result.status === 'failed') {
        this.sessions.delete(sessionKey);
        return { status: 'failed', reason: result.reason, canContinue: false };
      }

      const knownQuestions = new Set(session.knowledge.map((item) => item.question.trim()));
      const questions = Array.from(new Set(result.questions.map((question) => question.trim()).filter(Boolean)))
        .filter((question) => !knownQuestions.has(question));

      if (questions.length === 0) {
        return {
          status: 'not-completed',
          reason: result.reason ?? 'Worker requested information that is already available and made no progress.',
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
        session.knowledge.push(await this.research.ask(question));
      }
    }

    return {
      status: 'not-completed',
      reason: lastAttemptError
        ? `Worker attempt limit reached (${this.maxAttempts}). Last attempt error: ${lastAttemptError}`
        : `Worker attempt limit reached (${this.maxAttempts}).`,
      canContinue: true,
    };
  }
}
