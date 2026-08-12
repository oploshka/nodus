// RequirementMapCompilerSmoke.ts
import { PlanCompiler } from '@planner/PlanCompiler';
import { STATUS_SCENARIO_REQUIREMENTS } from '@planner/Scenario/StatusScenario';
import { StepRegistry } from '@planner/StepRegistry';
import { formatWorkflowDataRef, parseWorkflowDataRef } from '@planner/WorkflowData';

console.log('## backward requirement map compiler smoke');

const ref = parseWorkflowDataRef('fact:project.id.access@cli');
if (ref.kind !== 'fact' || ref.key !== 'project.id.access' || ref.scope !== 'cli') throw new Error('Typed workflow data ref parsing failed');
if (formatWorkflowDataRef(ref) !== 'fact:project.id.access@cli') throw new Error('Typed workflow data ref formatting failed');
console.log('typed data refs separate kind/key/scope: OK');

const plan = new PlanCompiler(new StepRegistry()).compile(STATUS_SCENARIO_REQUIREMENTS, 'ru');
const types = plan.steps.map((step) => step.type);
if (types.join(',') !== 'search,search,search,search,understand,understand,prepare-change,edit-file,finalize') {
  throw new Error(`Unexpected compiled workflow: ${types.join(' -> ')}`);
}
console.log('backward requirement graph compiles to familiar workflow steps: OK');

const searches = plan.steps.filter((step) => step.type === 'search');
if (searches.some((step) => step.maxAttempts !== 1)) throw new Error('Compiled search must use one semantic attempt');
if (searches.some((step) => !step.sourceHints?.length)) throw new Error('Grounded evidence source hints were not preserved on compiled search steps');
const currentIndex = searches.find((step) => step.outputs.includes('evidence:project.index.currentAccess'));
if (!currentIndex?.requirements?.[0]?.constraints?.includes('no-side-effects')) throw new Error('Evidence constraints were not preserved on the search contract');
console.log('search keeps grounded source hints, constraints, and one semantic attempt: OK');

const understands = plan.steps.filter((step) => step.type === 'understand');
if (understands.length !== 2) throw new Error(`Expected two dependency-aware understand steps, got ${understands.length}`);
const requiredFacts = new Set([
  'fact:project.id.access@cli',
  'fact:conversation.id.access@cli',
  'fact:project.index.fileCount.access@cli',
  'fact:cli.command.pattern@cli',
]);
const producedFacts = new Set(understands.flatMap((step) => step.outputs));
if ([...requiredFacts].some((output) => !producedFacts.has(output))) {
  throw new Error(`Understand outputs are missing required semantic facts: ${[...producedFacts].join(', ')}`);
}
const fileCountUnderstand = understands.find((step) => step.outputs.includes('fact:project.index.fileCount.access@cli'));
const fileCountContract = fileCountUnderstand?.requirements?.find((item) => item.ref === 'fact:project.index.fileCount.access@cli');
if (!fileCountContract?.constraints?.includes('must-not-scan-or-refresh')) throw new Error('Fact semantic constraints were not preserved');
console.log('understand keeps dependency-aware evidence -> constrained fact boundaries: OK');

const prepare = plan.steps.find((step) => step.type === 'prepare-change');
if (!prepare) throw new Error('Prepare-change step is missing');
if (prepare.inputs.some((input) => input.startsWith('evidence:'))) throw new Error('Prepare-change must not consume raw evidence');
if (!prepare.inputs.every((input) => input.startsWith('fact:'))) throw new Error(`Prepare-change must consume only semantic facts: ${prepare.inputs.join(', ')}`);
if (prepare.targetPath !== 'src/cli/Cli.ts') throw new Error('Prepare-change target must be grounded for deterministic fast path');
console.log('prepare-change consumes facts only and keeps grounded target: OK');

const edit = plan.steps.find((step) => step.type === 'edit-file');
if (edit?.targetPath !== 'src/cli/Cli.ts') throw new Error('Compiled edit target is not grounded');
if (edit.inputs[0] !== 'change-definition:status.command') throw new Error('Edit must consume the change definition');
console.log('edit consumes change-definition and keeps grounded target: OK');

let contractRejected = false;
try {
  new StepRegistry().assertDataContract('prepare-change', ['evidence:project.id.definition'], ['change-definition:status.command']);
} catch {
  contractRejected = true;
}
if (!contractRejected) throw new Error('Step data contract did not reject evidence -> prepare-change');
console.log('step contracts reject wrong data kinds before model execution: OK');
console.log('PASS');
