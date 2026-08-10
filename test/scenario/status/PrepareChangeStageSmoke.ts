// PrepareChangeStageSmoke.ts
import { runStepHarness } from '../../Support/StepHarness';
import { STATUS_INTEGRATION_FACTS } from './StatusCommandScenario';

const inputs = STATUS_INTEGRATION_FACTS.map((fact) => fact.key);
const result = await runStepHarness({
  step: {
    id: 'status-prepare-stage',
    type: 'prepare-change',
    action: 'define-change',
    subject: 'minimal /status change in src/cli/Cli.ts',
    goal: 'Определить точное изменение команды /status',
    status: 'pending',
    maxAttempts: 1,
    inputs,
    outputs: ['change-definition:status.command'],
    targetPath: 'src/cli/Cli.ts',
    requirements: [{
      ref: 'change-definition:status.command',
      description: 'minimal /status command implementation',
      targetPath: 'src/cli/Cli.ts',
      constraints: ['minimal-change', 'reuse-existing-api', 'no-side-effects-for-status-read'],
    }],
  },
  seedFacts: STATUS_INTEGRATION_FACTS.map((fact) => ({ ...fact, evidence: [...fact.evidence] })),
  model: () => {
    throw new Error('Grounded prepare-change should use deterministic compilation before model fallback');
  },
});

if (result.modelCalls !== 0) throw new Error(`Prepare-change fast path should use zero model calls, got ${result.modelCalls}`);
if (result.toolCalls !== 0) throw new Error('Prepare-change must not search/read files when semantic facts are supplied');
if (result.recoveryCalls !== 0) throw new Error('Prepare-change stage unexpectedly entered recovery');
const change = result.state.executionContext.all().find((fact) => fact.key === 'change-definition:status.command');
if (!change) throw new Error('Typed change definition was not stored');
if (!change.value.includes('src/cli/Cli.ts') || !change.value.includes('no-side-effects-for-status-read')) {
  throw new Error('Deterministic change definition did not preserve target/constraints');
}

console.log('## /status prepare-change stage');
console.log('prepare-change consumes established facts deterministically: OK');
console.log('zero model calls, zero tools: OK');
console.log('PASS');
