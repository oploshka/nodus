import { describe, expect, it } from 'vitest';
import { NullLogger } from '@app/Logging/Logger.js';
import type { ResearchAnswer } from '@engine/Research/ResearchTypes.js';
import type { ActionResult, WorkerAction } from '@engine/Worker/Action/WorkerAction.js';
import type { ChangeCodeActionData, ChangeCodeActionInput, tChangeCodeActionRequest } from '@engine/Worker/Action/ChangeCodeAction.js';
import type { ResearchActionInput } from '@engine/Worker/Action/ResearchAction.js';
import type { sReadProjectActionInput } from '@engine/Worker/Action/ReadProjectAction.js';
import type { sSearchProjectActionInput } from '@engine/Worker/Action/SearchProjectAction.js';
import { CodeWorker } from '@engine/Worker/CodeWorker.js';
import { ActionPresentation } from '@engine/Presentation/ActionPresentation.js';
import { ResearchPresentation } from '@engine/Presentation/ResearchPresentation.js';
import type { sWorkerReadContext, sWorkerSearchContext } from '@engine/Worker/WorkerContext.js';
import { createWorkerTestContext } from '@mock/WorkerTestContext.js';

class SequenceChangeAction implements WorkerAction<ChangeCodeActionInput, ChangeCodeActionData, tChangeCodeActionRequest> {
  public readonly id = 'change-code';
  public readonly presentation = new ActionPresentation({ name: { en: 'Test change' } });
  public readonly description = 'test change action';
  public readonly contextKinds: string[][] = [];

  public constructor(private readonly results: Array<ActionResult<ChangeCodeActionData, tChangeCodeActionRequest>>) {}

  public async run(input: ChangeCodeActionInput): Promise<ActionResult<ChangeCodeActionData, tChangeCodeActionRequest>> {
    this.contextKinds.push(input.context.map((item) => item.kind));
    const result = this.results.shift();
    if (!result) throw new Error('No scripted action result');
    return result;
  }
}

class ScriptedSearchAction implements WorkerAction<sSearchProjectActionInput, sWorkerSearchContext> {
  public readonly id = 'search';
  public readonly presentation = new ActionPresentation({ name: { en: 'Search' } });
  public readonly description = 'test search action';
  public readonly queries: string[] = [];

  public async run(input: sSearchProjectActionInput): Promise<ActionResult<sWorkerSearchContext>> {
    this.queries.push(input.query);
    return { status: 'completed', data: { kind: 'search', query: input.query, paths: ['src/TodoStore.ts'] } };
  }
}

class ScriptedReadAction implements WorkerAction<sReadProjectActionInput, sWorkerReadContext> {
  public readonly id = 'read';
  public readonly presentation = new ActionPresentation({ name: { en: 'Read' } });
  public readonly description = 'test read action';
  public readonly paths: string[] = [];
  public readonly contents: string[] = [];

  public async run(input: sReadProjectActionInput): Promise<ActionResult<sWorkerReadContext>> {
    this.paths.push(input.path);
    const content = await input.readFile(input.path);
    this.contents.push(content);
    return { status: 'completed', data: { kind: 'read', path: input.path, content } };
  }
}

class ScriptedResearchAction implements WorkerAction<ResearchActionInput, ResearchAnswer> {
  public readonly id = 'research';
  public readonly presentation = new ResearchPresentation();
  public readonly description = 'test research action';
  public readonly asked: string[] = [];
  public readonly readContents: string[] = [];

  public constructor(private readonly readPath?: string) {}

  public async run(input: ResearchActionInput): Promise<ActionResult<ResearchAnswer>> {
    this.asked.push(input.question);
    if (this.readPath && input.readFile) this.readContents.push(await input.readFile(this.readPath));
    return { status: 'completed', data: answer(input.question) };
  }
}

function answer(question: string): ResearchAnswer {
  return { question, status: 'resolved', answer: `answer:${question}`, sources: [], createdAt: new Date(0).toISOString() };
}

function worker(change: SequenceChangeAction, research = new ScriptedResearchAction()) {
  return {
    search: new ScriptedSearchAction(),
    read: new ScriptedReadAction(),
    research,
    build(search = new ScriptedSearchAction(), read = new ScriptedReadAction()) {
      return new CodeWorker(change, read, search, research, new NullLogger(), 4, 2);
    },
  };
}

describe('Iterative Worker action lifecycle', () => {
  it('uses cheap Search before retrying the primary action', async () => {
    const change = new SequenceChangeAction([
      { status: 'not-completed', reason: 'Need location', canContinue: true, requests: [{ actionId: 'search', input: { query: 'TodoStore' } }] },
      { status: 'completed', data: { summary: 'done' } },
    ]);
    const search = new ScriptedSearchAction();
    const read = new ScriptedReadAction();
    const research = new ScriptedResearchAction();
    const subject = new CodeWorker(change, read, search, research, new NullLogger(), 3, 2);
    const context = createWorkerTestContext();

    const result = await subject.run(context.data, context.instrument);

    expect(result.status).toBe('completed');
    expect(search.queries).toEqual(['TodoStore']);
    expect(research.asked).toHaveLength(0);
    expect(change.contextKinds).toEqual([[], ['search']]);
  });

  it('reads a known file through the current task-local Edit view', async () => {
    const change = new SequenceChangeAction([
      { status: 'not-completed', reason: 'Need file', canContinue: true, requests: [{ actionId: 'read', input: { path: 'a.ts' } }] },
      { status: 'completed', data: { summary: 'done' } },
    ]);
    const read = new ScriptedReadAction();
    const subject = new CodeWorker(change, read, new ScriptedSearchAction(), new ScriptedResearchAction(), new NullLogger(), 3, 2);
    const context = createWorkerTestContext({ files: { 'a.ts': 'task-local content' } });

    const result = await subject.run(context.data, context.instrument);

    expect(result.status).toBe('completed');
    expect(read.paths).toEqual(['a.ts']);
    expect(read.contents).toEqual(['task-local content']);
    expect(change.contextKinds).toEqual([[], ['read']]);
  });

  it('runs Research only when explicitly requested and keeps it separately bounded', async () => {
    const change = new SequenceChangeAction([
      { status: 'not-completed', reason: 'Need project convention', canContinue: true, requests: [{ actionId: 'research', input: { question: 'How are missing entities handled?' } }] },
      { status: 'completed', data: { summary: 'done' } },
    ]);
    const research = new ScriptedResearchAction();
    const subject = new CodeWorker(change, new ScriptedReadAction(), new ScriptedSearchAction(), research, new NullLogger(), 3, 2);
    const context = createWorkerTestContext();

    const result = await subject.run(context.data, context.instrument);

    expect(result.status).toBe('completed');
    expect(research.asked).toEqual(['How are missing entities handled?']);
    expect(change.contextKinds).toEqual([[], ['research']]);
  });

  it('does not run retrieval or Research when the primary action completes immediately', async () => {
    const change = new SequenceChangeAction([{ status: 'completed', data: { summary: 'done without context' } }]);
    const read = new ScriptedReadAction();
    const search = new ScriptedSearchAction();
    const research = new ScriptedResearchAction();
    const subject = new CodeWorker(change, read, search, research, new NullLogger(), 3, 2);
    const context = createWorkerTestContext();

    const result = await subject.run(context.data, context.instrument);

    expect(result.status).toBe('completed');
    expect(read.paths).toHaveLength(0);
    expect(search.queries).toHaveLength(0);
    expect(research.asked).toHaveLength(0);
  });

  it('returns not-completed when its local Research budget is exhausted', async () => {
    const change = new SequenceChangeAction([{
      status: 'not-completed',
      reason: 'Need analysis',
      canContinue: true,
      requests: [
        { actionId: 'research', input: { question: 'q1' } },
        { actionId: 'research', input: { question: 'q2' } },
      ],
    }]);
    const subject = new CodeWorker(change, new ScriptedReadAction(), new ScriptedSearchAction(), new ScriptedResearchAction(), new NullLogger(), 3, 1);
    const context = createWorkerTestContext();

    const result = await subject.run(context.data, context.instrument);
    expect(result.status).toBe('not-completed');
  });
});
