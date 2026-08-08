import { ExecutionContext } from '@agent/Planning/ExecutionContext';
import { ContextComposer } from '@agent/Planning/ContextComposer';
import type { PlanStep } from '@agent/Planning/TaskPlan';

const producer: PlanStep = {
  id: 'step-1',
  type: 'search',
  goal: 'Find CLI structure',
  status: 'completed',
  maxAttempts: 3,
  inputs: [],
  outputs: ['cli.structure'],
};

const consumer: PlanStep = {
  id: 'step-2',
  type: 'prepare-change',
  goal: 'Prepare change',
  status: 'pending',
  maxAttempts: 1,
  inputs: ['cli.structure'],
  outputs: ['status.change-plan'],
};

const context = new ExecutionContext();
context.mergeStepResult(producer, {
  goalSatisfied: true,
  findings: ['Commands are declared in COMMANDS and dispatched in Cli.run().'],
  evidence: [{ path: 'src/cli/Cli.ts', fact: 'COMMANDS contains command metadata.' }],
  missing: [],
  facts: [{
    key: 'cli.structure',
    value: 'Commands are declared in COMMANDS and dispatched in Cli.run().',
    evidence: [{ path: 'src/cli/Cli.ts', fact: 'COMMANDS contains command metadata.' }],
  }],
});

const composed = new ContextComposer().compose(context, consumer);
if (composed.missingInputs.length !== 0) throw new Error(`Unexpected missing inputs: ${composed.missingInputs.join(', ')}`);
if (composed.facts[0]?.key !== 'cli.structure') throw new Error('Expected cli.structure fact');
console.log('PASS: execution context data-flow works.');
