import { describe, expect, it } from 'vitest';
import { NullLogger } from '@app/Logging/Logger.js';
import type { ResearchAnswer } from '@engine/Research/ResearchTypes.js';
import type { ActionResult, WorkerAction } from '@engine/Worker/Action/WorkerAction.js';
import type { ChangeCodeActionData, ChangeCodeActionInput, tChangeCodeActionRequest } from '@engine/Worker/Action/ChangeCodeAction.js';
import type { ResearchActionInput } from '@engine/Worker/Action/ResearchAction.js';
import type { sReadFileActionInput } from '@engine/Worker/Action/ReadFileAction.js';
import type { sFindFileActionInput } from '@engine/Worker/Action/FindFileAction.js';
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

class ScriptedFindFileAction implements WorkerAction<sFindFileActionInput, sWorkerSearchContext> {
  public readonly id = 'find-file';
  public readonly presentation = new ActionPresentation({ name: { en: 'Find file' } });
  public readonly description = 'test find file action';
  public readonly queries: string[] = [];

  public constructor(private readonly paths = ['src/TodoStore.ts']) {}

  public async run(input: sFindFileActionInput): Promise<ActionResult<sWorkerSearchContext>> {
    this.queries.push(input.query);
    return { status: 'completed', data: { kind: 'search', query: input.query, paths: this.paths } };
  }
}

class ScriptedReadFileAction implements WorkerAction<sReadFileActionInput, sWorkerReadContext> {
  public readonly id = 'read-file';
  public readonly presentation = new ActionPresentation({ name: { en: 'Read file' } });
  public readonly description = 'test read file action';
  public readonly paths: string[] = [];
  public readonly contents: string[] = [];

  public async run(input: sReadFileActionInput): Promise<ActionResult<sWorkerReadContext>> {
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

describe('Iterative Worker action lifecycle', () => {
  it('uses cheap FindFile before retrying the primary action', async () => {
    const change = new SequenceChangeAction([
      { status: 'not-completed', reason: 'Need location', canContinue: true, requests: [{ actionId: 'find-file', input: { query: 'TodoStore' } }] },
      { status: 'completed', data: { summary: 'done' } },
    ]);
    const findFile = new ScriptedFindFileAction();
    const readFile = new ScriptedReadFileAction();
    const research = new ScriptedResearchAction();
    const subject = new CodeWorker(change, readFile, findFile, research, new NullLogger(), 3, 2);
    const context = createWorkerTestContext();

    const result = await subject.run(context.data, context.instrument);

    expect(result.status).toBe('completed');
    expect(findFile.queries).toEqual(['TodoStore']);
    expect(research.asked).toHaveLength(0);
    expect(change.contextKinds).toEqual([[], ['search']]);
  });

  it('reads a known file through the current task-local Edit view', async () => {
    const change = new SequenceChangeAction([
      { status: 'not-completed', reason: 'Need file', canContinue: true, requests: [{ actionId: 'read-file', input: { path: 'a.ts' } }] },
      { status: 'completed', data: { summary: 'done' } },
    ]);
    const readFile = new ScriptedReadFileAction();
    const subject = new CodeWorker(change, readFile, new ScriptedFindFileAction(), new ScriptedResearchAction(), new NullLogger(), 3, 2);
    const context = createWorkerTestContext({ files: { 'a.ts': 'task-local content' } });

    const result = await subject.run(context.data, context.instrument);

    expect(result.status).toBe('completed');
    expect(readFile.paths).toEqual(['a.ts']);
    expect(readFile.contents).toEqual(['task-local content']);
    expect(change.contextKinds).toEqual([[], ['read']]);
  });

  it('does not count a differently worded FindFile request as progress when it returns only known paths', async () => {
    const change = new SequenceChangeAction([
      { status: 'not-completed', reason: 'Need location', canContinue: true, requests: [{ actionId: 'find-file', input: { query: 'TodoStore' } }] },
      { status: 'not-completed', reason: 'Need implementation', canContinue: true, requests: [{ actionId: 'find-file', input: { query: 'TodoStore implementation details' } }] },
      { status: 'completed', data: { summary: 'done' } },
    ]);
    const findFile = new ScriptedFindFileAction(['src/TodoStore.ts']);
    const subject = new CodeWorker(change, new ScriptedReadFileAction(), findFile, new ScriptedResearchAction(), new NullLogger(), 4, 2);
    const context = createWorkerTestContext();

    const result = await subject.run(context.data, context.instrument);

    expect(result.status).toBe('completed');
    expect(findFile.queries).toEqual(['TodoStore', 'TodoStore implementation details']);
    expect(change.contextKinds).toEqual([[], ['search'], ['search', 'retrieval-feedback']]);
  });

  it('does not re-read a path already present in context and gives the primary action feedback', async () => {
    const change = new SequenceChangeAction([
      { status: 'not-completed', reason: 'Need file', canContinue: true, requests: [{ actionId: 'read-file', input: { path: 'a.ts' } }] },
      { status: 'not-completed', reason: 'Need file again', canContinue: true, requests: [{ actionId: 'read-file', input: { path: './a.ts' } }] },
      { status: 'completed', data: { summary: 'done' } },
    ]);
    const readFile = new ScriptedReadFileAction();
    const subject = new CodeWorker(change, readFile, new ScriptedFindFileAction(), new ScriptedResearchAction(), new NullLogger(), 4, 2);
    const context = createWorkerTestContext({ files: { 'a.ts': 'task-local content' } });

    const result = await subject.run(context.data, context.instrument);

    expect(result.status).toBe('completed');
    expect(readFile.paths).toEqual(['a.ts']);
    expect(change.contextKinds).toEqual([[], ['read'], ['read', 'retrieval-feedback']]);
  });

  it('runs Research only when explicitly requested and keeps it separately bounded', async () => {
    const change = new SequenceChangeAction([
      { status: 'not-completed', reason: 'Need project convention', canContinue: true, requests: [{ actionId: 'research', input: { question: 'How are missing entities handled?' } }] },
      { status: 'completed', data: { summary: 'done' } },
    ]);
    const research = new ScriptedResearchAction();
    const subject = new CodeWorker(change, new ScriptedReadFileAction(), new ScriptedFindFileAction(), research, new NullLogger(), 3, 2);
    const context = createWorkerTestContext();

    const result = await subject.run(context.data, context.instrument);

    expect(result.status).toBe('completed');
    expect(research.asked).toEqual(['How are missing entities handled?']);
    expect(change.contextKinds).toEqual([[], ['research']]);
  });

  it('does not run retrieval or Research when the primary action completes immediately', async () => {
    const change = new SequenceChangeAction([{ status: 'completed', data: { summary: 'done without context' } }]);
    const readFile = new ScriptedReadFileAction();
    const findFile = new ScriptedFindFileAction();
    const research = new ScriptedResearchAction();
    const subject = new CodeWorker(change, readFile, findFile, research, new NullLogger(), 3, 2);
    const context = createWorkerTestContext();

    const result = await subject.run(context.data, context.instrument);

    expect(result.status).toBe('completed');
    expect(readFile.paths).toHaveLength(0);
    expect(findFile.queries).toHaveLength(0);
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
    const subject = new CodeWorker(change, new ScriptedReadFileAction(), new ScriptedFindFileAction(), new ScriptedResearchAction(), new NullLogger(), 3, 1);
    const context = createWorkerTestContext();

    const result = await subject.run(context.data, context.instrument);
    expect(result.status).toBe('not-completed');
  });
});
