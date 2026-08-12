import { PlanCompiler } from '@planner/PlanCompiler';
import { STATUS_SCENARIO_REQUIREMENTS } from '@planner/Scenario/StatusScenario';
import { StepRegistry } from '@planner/StepRegistry';

const plan = new PlanCompiler(new StepRegistry()).compile(STATUS_SCENARIO_REQUIREMENTS, 'ru');
const understand = plan.steps.filter((step) => step.type === 'understand');
if (understand.length !== 2) throw new Error(`Expected two semantic layers, received ${understand.length}`);
if (!understand[0].outputs.includes('fact:projectSession.access@cli')) throw new Error('First semantic layer must establish CLI ProjectSession receiver');
if (understand[0].outputs.includes('fact:project.index.fileCount.access@cli')) throw new Error('Constrained index access must not share the first semantic layer');
if (understand[1].outputs.length !== 1 || understand[1].outputs[0] !== 'fact:project.index.fileCount.access@cli') throw new Error('Second semantic layer must isolate index file-count access');
if (!understand[1].inputs.includes('fact:projectSession.access@cli')) throw new Error('Index semantic layer must consume established ProjectSession receiver');
if ((understand[1].sourceHints ?? []).includes('src/cli/Cli.ts')) throw new Error('Second semantic layer should not reread Cli.ts after receiver is established');

console.log('## fact layer compiler');
console.log('runtime facts and constrained integration fact split: OK');
console.log('second layer reuses ProjectSession receiver without rereading CLI: OK');
console.log('PASS');
