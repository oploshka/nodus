// FinalizeStageSmoke.ts
import { runStepHarness } from '../../Support/StepHarness';

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
  model: () => ({
    status: 'completed',
    message: 'Done.',
    finalAnswer: 'Команда /status добавлена в CLI.',
    toolCalls: [],
    changes: [],
    observations: [],
  }),
});

if (result.modelCalls !== 1) throw new Error(`Finalize should use one model call, got ${result.modelCalls}`);
if (result.toolCalls !== 0) throw new Error('Finalize must not call tools');
if (result.recoveryCalls !== 0) throw new Error('Finalize unexpectedly entered recovery');
if (result.state.execution.result !== 'Команда /status добавлена в CLI.') throw new Error('Finalize answer was not stored');

console.log('## /status finalize stage');
console.log('finalize consumes typed change-result only: OK');
console.log('PASS');
