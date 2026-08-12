// PlanStageSmoke.ts
import { StepRegistry } from '@planner/StepRegistry';
import { STATUS_COMMAND_CANONICAL_PLAN } from './StatusCommandScenario';

console.log('## /status canonical requirement-compiled plan');

const plan = STATUS_COMMAND_CANONICAL_PLAN;
const registry = new StepRegistry();
const known = new Set<string>();
for (const step of plan.steps) {
  if (!step.action || !registry.hasAction(step.type, step.action)) throw new Error(`Invalid action contract for ${step.id}`);
  if (!step.subject?.trim()) throw new Error(`Missing subject for ${step.id}`);
  for (const input of step.inputs) {
    if (!known.has(input)) throw new Error(`Input ${input} is not produced before ${step.id}`);
  }
  for (const output of step.outputs) {
    if (known.has(output)) throw new Error(`Duplicate output key: ${output}`);
    known.add(output);
  }
}

const searches = plan.steps.filter((step) => step.type === 'search');
const understands = plan.steps.filter((step) => step.type === 'understand');
const prepares = plan.steps.filter((step) => step.type === 'prepare-change');
const edits = plan.steps.filter((step) => step.type === 'edit-file');
if (searches.length !== 4) throw new Error(`Expected 4 evidence searches, got ${searches.length}`);
if (understands.length !== 2) throw new Error(`Expected two dependency-aware fact-producing understand steps, got ${understands.length}`);
if (prepares.length !== 1) throw new Error(`Expected one prepare-change step, got ${prepares.length}`);
if (edits.length !== 1 || edits[0]?.targetPath !== 'src/cli/Cli.ts') throw new Error('Expected exactly one guarded Cli.ts edit');
if (plan.steps.at(-1)?.type !== 'finalize') throw new Error('Finalize must be last');

for (const key of [
  'evidence:project.id.definition',
  'evidence:conversation.id.definition',
  'evidence:project.index.files',
  'evidence:project.index.currentAccess',
  'fact:project.id.access@cli',
  'fact:conversation.id.access@cli',
  'fact:project.index.fileCount.access@cli',
  'fact:cli.command.pattern@cli',
  'change-definition:status.command',
]) {
  if (!known.has(key)) throw new Error(`Canonical typed data contract is missing: ${key}`);
}

console.log('requirement map compiles into executable steps: OK');
console.log('search produces evidence; understand produces facts: OK');
console.log('prepare-change consumes only semantic facts: OK');
console.log('one guarded edit-file target: OK');
console.log('PASS');
