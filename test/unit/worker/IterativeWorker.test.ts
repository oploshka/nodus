import { describe, expect, it } from 'vitest';
import { NullLogger } from '@app/Logging/Logger.js';
import type { ResearchAnswer } from '@engine/Research/ResearchTypes.js';
import { Task } from '@engine/Task/Task.js';
import type { ActionResult, WorkerAction } from '@engine/Worker/Action/WorkerAction.js';
import type { ChangeCodeActionData, ChangeCodeActionInput, ResearchActionRequest } from '@engine/Worker/Action/ChangeCodeAction.js';
import type { ResearchActionInput } from '@engine/Worker/Action/ResearchAction.js';
import { CodeWorker } from '@engine/Worker/CodeWorker.js';

class SequenceChangeAction implements WorkerAction<ChangeCodeActionInput, ChangeCodeActionData, ResearchActionRequest> {
  public readonly id = 'change-code';
  public readonly description = 'test change action';
  public readonly knowledgeSizes: number[] = [];

  public constructor(private readonly results: Array<ActionResult<ChangeCodeActionData, ResearchActionRequest>>) {}

  public async run(input: ChangeCodeActionInput): Promise<ActionResult<ChangeCodeActionData, ResearchActionRequest>> {
    this.knowledgeSizes.push(input.knowledge.length);
    const result = this.results.shift();
    if (!result) throw new Error('No scripted action result');
    return result;
  }
}

class ScriptedResearchAction implements WorkerAction<ResearchActionInput, ResearchAnswer> {
  public readonly id = 'research';
  public readonly description = 'test research action';
  public readonly asked: string[] = [];

  public async run(input: ResearchActionInput): Promise<ActionResult<ResearchAnswer>> {
    this.asked.push(input.question);
    return { status: 'completed', data: answer(input.question) };
  }
}

function answer(question: string): ResearchAnswer {
  return { question, status: 'resolved', answer: `answer:${question}`, sources: [], createdAt: new Date(0).toISOString() };
}

describe('Iterative Worker action lifecycle', () => {
  it('starts with change action, runs requested Research action, then retries the same task', async () => {
    const change = new SequenceChangeAction([
      {
        status: 'not-completed',
        reason: 'Need one fact',
        canContinue: true,
        requests: [{ actionId: 'research', input: { question: 'Where is CLI dispatch?' } }],
      },
      { status: 'completed', data: { summary: 'done' } },
    ]);
    const research = new ScriptedResearchAction();
    const worker = new CodeWorker(change, research, new NullLogger(), 3, 2);

    const result = await worker.run(new Task('task', 'p'), { id: 's1', goal: 'goal', constraints: [] });

    expect(result.status).toBe('completed');
    expect(research.asked).toEqual(['Where is CLI dispatch?']);
    expect(change.knowledgeSizes).toEqual([0, 1]);
  });

  it('does not run Research when the primary action completes immediately', async () => {
    const change = new SequenceChangeAction([{ status: 'completed', data: { summary: 'done without research' } }]);
    const research = new ScriptedResearchAction();
    const worker = new CodeWorker(change, research, new NullLogger(), 3, 2);

    const result = await worker.run(new Task('task', 'p'), { id: 's1', goal: 'goal', constraints: [] });

    expect(result.status).toBe('completed');
    expect(research.asked).toHaveLength(0);
    expect(change.knowledgeSizes).toEqual([0]);
  });

  it('returns not-completed when its local Research action budget is exhausted', async () => {
    const change = new SequenceChangeAction([{
      status: 'not-completed',
      reason: 'Need facts',
      canContinue: true,
      requests: [
        { actionId: 'research', input: { question: 'q1' } },
        { actionId: 'research', input: { question: 'q2' } },
      ],
    }]);
    const worker = new CodeWorker(change, new ScriptedResearchAction(), new NullLogger(), 3, 1);

    const result = await worker.run(new Task('task', 'p'), { id: 's1', goal: 'goal', constraints: [] });
    expect(result.status).toBe('not-completed');
  });
});
