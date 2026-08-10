// EditStageSmoke.ts
import { runStepHarness } from '@test/support/StepHarness';
import { STATUS_CHANGE_FACT, STATUS_CLI_SOURCE } from './StatusCommandScenario';

const result = await runStepHarness({
  step: {
    id: 'status-edit-stage',
    type: 'edit-file',
    action: 'apply-change',
    subject: '/status in src/cli/Cli.ts',
    goal: 'Применить изменение команды /status',
    status: 'pending',
    maxAttempts: 1,
    inputs: ['change-definition:status.command'],
    outputs: ['change-result:status.command'],
    targetPath: 'src/cli/Cli.ts',
  },
  seedFacts: [{ ...STATUS_CHANGE_FACT, evidence: [...STATUS_CHANGE_FACT.evidence] }],
  model: (input) => {
    const source = input.execution.getToolContext();
    if (source.length !== 1 || source[0]?.call.input.path !== 'src/cli/Cli.ts') {
      throw new Error('edit-file must receive exactly the preloaded target source');
    }
    if (!String(source[0]?.result.data).includes('COMMANDS')) throw new Error('Preloaded Cli.ts source is missing');
    input.execution.consumeToolContext();
    return {
      status: 'completed',
      message: 'Cli.ts edited.',
      toolCalls: [],
      changes: [{
        type: 'write',
        path: 'src/cli/Cli.ts',
        content: `${STATUS_CLI_SOURCE}\n// /status handler added\n`,
      }],
      observations: [],
    };
  },
  tool: (calls, execution) => {
    if (calls.length !== 1 || calls[0]?.tool !== 'file-system' || calls[0]?.input.action !== 'read') {
      throw new Error('Runtime should preload edit target with one file-system/read');
    }
    execution.setToolContext([{ call: calls[0], result: { ok: true, data: STATUS_CLI_SOURCE } }], 1);
    return 1;
  },
});

if (result.modelCalls !== 1) throw new Error(`edit-file should use one model call after preload, got ${result.modelCalls}`);
if (result.toolCalls !== 1) throw new Error(`edit-file should preload target exactly once, got ${result.toolCalls}`);
if (result.appliedChanges.length !== 1) throw new Error('Expected exactly one applied Cli.ts change');
if (result.recoveryCalls !== 0) throw new Error('edit-file stage unexpectedly entered recovery');
if (!result.state.executionContext.has('change-result:status.command')) throw new Error('Typed change-result postcondition was not stored');

console.log('## /status edit-file stage');
console.log('change-definition + target source are sufficient for edit: OK');
console.log('target source preloaded once by runtime: OK');
console.log('PASS');
