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
  },
  seedFacts: STATUS_INTEGRATION_FACTS.map((fact) => ({ ...fact, evidence: [...fact.evidence] })),
  model: (input) => {
    const known = new Set((input.stepContext?.facts ?? []).map((fact) => fact.key));
    for (const key of inputs) if (!known.has(key)) throw new Error(`Prepare-change is missing semantic fact ${key}`);
    return {
      status: 'completed',
      message: 'Prepared minimal Cli.ts change.',
      toolCalls: [],
      changes: [],
      observations: [],
      stepResult: {
        goalSatisfied: true,
        targets: ['src/cli/Cli.ts'],
        findings: ['Add one COMMANDS entry and one inline /status branch using the established facts.'],
        evidence: [{ path: 'src/cli/Cli.ts', fact: 'Existing command integration pattern is established.' }],
        missing: [],
        facts: [{
          key: 'change-definition:status.command',
          value: 'Edit only src/cli/Cli.ts: add /status to COMMANDS and one inline handler using the established CLI access facts.',
          evidence: [],
        }],
      },
    };
  },
});

if (result.modelCalls !== 1) throw new Error(`Prepare-change stage should use one model call, got ${result.modelCalls}`);
if (result.toolCalls !== 0) throw new Error('Prepare-change must not search/read files when semantic facts are supplied');
if (result.recoveryCalls !== 0) throw new Error('Prepare-change stage unexpectedly entered recovery');
if (!result.state.executionContext.has('change-definition:status.command')) throw new Error('Typed change definition was not stored');

console.log('## /status prepare-change stage');
console.log('prepare-change consumes facts, not search evidence: OK');
console.log('one model call, zero tools: OK');
console.log('PASS');
