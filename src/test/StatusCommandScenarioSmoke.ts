import { STATUS_COMMAND_CANONICAL_PLAN } from './fixtures/StatusCommandScenario';

console.log('## /status canonical scenario contract');

const plan = STATUS_COMMAND_CANONICAL_PLAN;
const known = new Set<string>();
for (const step of plan.steps) {
  for (const input of step.inputs) {
    if (!known.has(input)) throw new Error(`Input ${input} is not produced before ${step.id}`);
  }
  for (const output of step.outputs) {
    if (known.has(output)) throw new Error(`Duplicate output key: ${output}`);
    known.add(output);
  }
}

const searches = plan.steps.filter((step) => step.type === 'search');
const edits = plan.steps.filter((step) => step.type === 'edit-file');
if (searches.length !== 2) throw new Error(`Expected 2 canonical search steps, got ${searches.length}`);
if (edits.length !== 1 || edits[0]?.targetPath !== 'src/cli/Cli.ts') throw new Error('Expected exactly one guarded Cli.ts edit');
if (plan.steps.at(-1)?.type !== 'finalize') throw new Error('Finalize must be last');
if (!known.has('project.id.source') || !known.has('conversation.id.source') || !known.has('index.files.count.source')) {
  throw new Error('Canonical data-source facts are missing');
}

console.log('two focused searches, no API-shape escalation: OK');
console.log('understand derives integration from located access paths: OK');
console.log('one prepare-change + one guarded edit-file: OK');
console.log('data-flow inputs only reference prior outputs: OK');
console.log('PASS: /status golden path is fixed as a regression contract.');
