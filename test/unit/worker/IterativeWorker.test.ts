import { describe, expect, it } from 'vitest';
import { NullLogger } from '@app/Logging/Logger.js';
import type { ResearchAnswer } from '@engine/Research/ResearchTypes.js';
import { Task } from '@engine/Task/Task.js';
import type { WorkerAttempt, WorkerAttemptResult } from '@engine/Worker/Attempt/WorkerAttempt.js';
import { CodeWorker } from '@engine/Worker/CodeWorker.js';

class SequenceAttempt implements WorkerAttempt {
  public readonly knowledgeSizes: number[] = [];

  public constructor(private readonly results: WorkerAttemptResult[]) {}

  public async execute(context: Parameters<WorkerAttempt['execute']>[0]): Promise<WorkerAttemptResult> {
    this.knowledgeSizes.push(context.knowledge.length);
    const result = this.results.shift();
    if (!result) throw new Error('No scripted attempt result');
    return result;
  }
}

function answer(question: string): ResearchAnswer {
  return { question, status: 'resolved', answer: `answer:${question}`, sources: [], createdAt: new Date(0).toISOString() };
}

describe('Iterative Worker lifecycle', () => {
  it('attempts first, researches concrete missing information, then retries the same task', async () => {
    const attempt = new SequenceAttempt([
      { status: 'missing-information', questions: ['Where is CLI dispatch?'] },
      { status: 'completed', summary: 'done' },
    ]);
    const asked: string[] = [];
    const research = {
      async ask(question: string) {
        asked.push(question);
        return answer(question);
      },
    };
    const worker = new CodeWorker(attempt, research, new NullLogger(), 3, 2);

    const result = await worker.run(new Task('task', 'p'), { id: 's1', goal: 'goal', constraints: [] });

    expect(result.status).toBe('completed');
    expect(asked).toEqual(['Where is CLI dispatch?']);
    expect(attempt.knowledgeSizes).toEqual([0, 1]);
  });


  it('does not call Research when the first execution attempt is already sufficient', async () => {
    const attempt = new SequenceAttempt([
      { status: 'completed', summary: 'done without research' },
    ]);
    let researchCalls = 0;
    const worker = new CodeWorker(
      attempt,
      { async ask(question: string) { researchCalls += 1; return answer(question); } },
      new NullLogger(),
      3,
      2,
    );

    const result = await worker.run(new Task('task', 'p'), { id: 's1', goal: 'goal', constraints: [] });

    expect(result.status).toBe('completed');
    expect(researchCalls).toBe(0);
    expect(attempt.knowledgeSizes).toEqual([0]);
  });

  it('returns not-completed when its local research budget is exhausted', async () => {
    const attempt = new SequenceAttempt([
      { status: 'missing-information', questions: ['q1', 'q2'] },
    ]);
    const worker = new CodeWorker(
      attempt,
      { async ask(question: string) { return answer(question); } },
      new NullLogger(),
      3,
      1,
    );

    const result = await worker.run(new Task('task', 'p'), { id: 's1', goal: 'goal', constraints: [] });
    expect(result.status).toBe('not-completed');
  });
});
