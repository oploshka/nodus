// SearchStageSmoke.ts
import { runStepHarness } from '../../support/StepHarness';

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
    outputs: ['evidence:project.id.definition'],
    sourceHints: ['src/project/ProjectSession/ProjectSession.ts'],
  },
  model: () => {
    throw new Error('Grounded search should compile retrieval without a model call');
  },
  tool: (calls, execution) => {
    execution.setToolContext(calls.map((call) => ({
      call,
      result: {
        ok: true,
        data: call.tool === 'search' && call.input.query === 'projectId'
          ? [{ path: 'src/project/ProjectSession/ProjectSession.ts', line: 20, text: 'public get projectId(): string {' }]
          : [],
      },
    })), 1);
    return calls.length;
  },
});

if (result.modelCalls !== 0) throw new Error(`Grounded search should not spend a model call, got ${result.modelCalls}`);
if (result.toolCalls < 1) throw new Error('Search stage should execute compiled retrieval calls');
if (result.recoveryCalls !== 0) throw new Error('Search stage must not enter recovery for a concrete result');
if (!result.state.executionContext.has('evidence:project.id.definition')) throw new Error('Typed evidence output was not stored');
if (result.state.plan.steps[0]?.status !== 'completed') throw new Error('Search step did not complete deterministically');

console.log('## /status search stage');
console.log('grounded search compiles retrieval without model tool syntax: OK');
console.log('search produces typed evidence and completes deterministically: OK');
console.log('PASS');
