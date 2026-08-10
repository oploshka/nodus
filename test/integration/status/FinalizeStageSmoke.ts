// FinalizeStageSmoke.ts
import { runStepHarness } from '../../support/StepHarness';

const result = await runStepHarness({
  step: {
    id: 'status-finalize-stage',
    type: 'finalize',
    action: 'summarize-result',
    subject: 'added /status CLI command',
    goal: 'Сообщить результат добавления /status',
    status: 'pending',
    maxAttempts: 1,
    inputs: ['change-result:status.command'],
    outputs: ['final-result:status.command'],
  },
  seedFacts: [{ key: 'change-result:status.command', value: 'src/cli/Cli.ts updated with /status.' }],
  model: () => {
    throw new Error('Finalize should compile a result from concrete change-result without a model call');
  },
});

if (result.modelCalls !== 0) throw new Error(`Deterministic finalize should use zero model calls, got ${result.modelCalls}`);
if (result.toolCalls !== 0) throw new Error('Finalize must not call tools');
if (result.recoveryCalls !== 0) throw new Error('Finalize unexpectedly entered recovery');
if (!result.state.executionContext.has('final-result:status.command')) throw new Error('Final result fact was not stored');
if (result.state.execution.status !== 'completed') throw new Error('Finalize did not complete execution');

console.log('## /status finalize stage');
console.log('finalize compiles concrete execution results without model: OK');
console.log('PASS');
