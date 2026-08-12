// RetrievalResultSmoke.ts
import { RetrievalResultClassifier } from '@research/Resolver/RetrievalResult';
import { runStepHarness } from '@test/support/StepHarness';

function entry(query: string, data: unknown) {
  return {
    call: { tool: 'search', input: { query, path: 'src/project/ProjectSession/ProjectSession.ts' } },
    result: { ok: true, data },
  };
}

const classifier = new RetrievalResultClassifier();
if (classifier.classify([entry('projectId', [{ path: 'x.ts', text: 'projectId' }])], []).match !== 'exact') {
  throw new Error('Concrete exact retrieval must classify as exact');
}
if (classifier.classify([entry('projectId', [])], [entry('ProjectSession', [{ path: 'x.ts', text: 'ProjectSession' }])]).match !== 'related') {
  throw new Error('Broader retrieval must classify as related when exact tier is empty');
}
if (classifier.classify([entry('projectId', [])], [entry('ProjectSession', [])]).match !== 'missing') {
  throw new Error('Empty exact and related retrieval must classify as missing');
}
console.log('## retrieval result classification');
console.log('exact | related | missing classification: OK');

const result = await runStepHarness({
  step: {
    id: 'related-only-search',
    type: 'search',
    action: 'find-definitions',
    subject: 'project ID source in ProjectSession.ts',
    goal: 'Find project ID source in ProjectSession.ts',
    status: 'pending',
    maxAttempts: 1,
    inputs: [],
    outputs: ['evidence:project.id.definition'],
    sourceHints: ['src/project/ProjectSession/ProjectSession.ts'],
    requirements: [{
      ref: 'evidence:project.id.definition',
      description: 'project ID definition',
      evidenceKind: 'definition',
      sourceHints: ['src/project/ProjectSession/ProjectSession.ts'],
    }],
  },
  model: () => {
    throw new Error('Typed search should not call model before deterministic retrieval');
  },
  tool: (calls, execution) => {
    execution.setToolContext(calls.map((call) => ({
      call,
      result: {
        ok: true,
        data: String(call.input.query) === 'ProjectSession'
          ? [{ path: 'src/project/ProjectSession/ProjectSession.ts', line: 1, text: 'export class ProjectSession {' }]
          : [],
      },
    })), 1);
    return calls.length;
  },
});

if (result.state.executionContext.has('evidence:project.id.definition')) {
  throw new Error('Related evidence must never satisfy the evidence requirement');
}
if (result.state.stepResults.get('related-only-search')?.retrieval?.match !== 'related') {
  throw new Error('Related-only search assessment was not preserved');
}
if (result.recoveryCalls !== 1) throw new Error('Without a resolution planner, related-only retrieval should fall through to recovery');
console.log('related evidence does not satisfy an evidence requirement: OK');
console.log('PASS');
