// SearchStageSmoke.ts
import { runStepHarness } from '../../Support/StepHarness';

const result = await runStepHarness({
  step: {
    id: 'status-search-stage',
    type: 'search',
    action: 'find-definitions',
    subject: 'project ID source in ProjectSession.ts',
    goal: 'Найти определения: project ID source in ProjectSession.ts',
    status: 'pending',
    maxAttempts: 1,
    inputs: [],
    outputs: ['project.id.source'],
  },
  model: () => ({
    status: 'continue',
    message: 'Search ProjectSession projectId.',
    toolCalls: [{ tool: 'search', input: { query: 'projectId', path: 'src/project/ProjectSession/ProjectSession.ts' } }],
    changes: [],
    observations: [],
  }),
  tool: (calls, execution) => {
    execution.setToolContext(calls.map((call) => ({
      call,
      result: {
        ok: true,
        data: [{ path: 'src/project/ProjectSession/ProjectSession.ts', line: 20, text: 'public get projectId(): string {' }],
      },
    })), 1);
    return calls.length;
  },
});

if (result.modelCalls !== 1) throw new Error(`Search stage should need one model call, got ${result.modelCalls}`);
if (result.toolCalls !== 1) throw new Error(`Search stage should execute one retrieval, got ${result.toolCalls}`);
if (result.recoveryCalls !== 0) throw new Error('Search stage must not enter recovery for a concrete result');
if (!result.state.executionContext.has('project.id.source')) throw new Error('Search output fact was not stored');
if (result.state.plan.steps[0]?.status !== 'completed') throw new Error('Search step did not complete deterministically');

console.log('## /status search stage');
console.log('one representative retrieval call: OK');
console.log('concrete result completes search without evaluator: OK');
console.log('PASS');
