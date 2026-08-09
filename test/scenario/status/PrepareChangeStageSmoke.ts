// PrepareChangeStageSmoke.ts
import { runStepHarness } from '../../Support/StepHarness';
import { STATUS_INTEGRATION_FACT } from './StatusCommandScenario';

const result = await runStepHarness({
  step: {
    id: 'status-prepare-stage',
    type: 'prepare-change',
    action: 'define-change',
    subject: 'minimal /status change in src/cli/Cli.ts',
    goal: 'Определить точное изменение команды /status',
    status: 'pending',
    maxAttempts: 1,
    inputs: ['cli.status.integration'],
    outputs: ['status.change-plan'],
  },
  seedFacts: [STATUS_INTEGRATION_FACT],
  model: () => ({
    status: 'completed',
    message: 'Prepared minimal Cli.ts change.',
    toolCalls: [],
    changes: [],
    observations: [],
    stepResult: {
      goalSatisfied: true,
      targets: ['src/cli/Cli.ts'],
      findings: ['Add one COMMANDS entry and one inline /status branch.'],
      evidence: [{ path: 'src/cli/Cli.ts', fact: 'Existing command integration pattern is known.' }],
      missing: [],
      facts: [{
        key: 'status.change-plan',
        value: 'Edit only src/cli/Cli.ts: add /status to COMMANDS and add one inline handler using existing project/conversation/index access paths.',
        evidence: [],
      }],
    },
  }),
});

if (result.modelCalls !== 1) throw new Error(`Prepare-change stage should use one model call, got ${result.modelCalls}`);
if (result.toolCalls !== 0) throw new Error('Prepare-change must not search/read files when integration fact is already supplied');
if (result.recoveryCalls !== 0) throw new Error('Prepare-change stage unexpectedly entered recovery');
if (!result.state.executionContext.has('status.change-plan')) throw new Error('Prepared change fact was not stored');

console.log('## /status prepare-change stage');
console.log('seeded understand output is enough; no earlier stages rerun: OK');
console.log('one model call, zero tools: OK');
console.log('PASS');
