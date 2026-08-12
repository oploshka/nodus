// RequirementResolutionPlannerSmoke.ts
import { RequirementResolutionPlanner } from '@planner/RequirementResolutionPlanner';
import { StepRegistry } from '@planner/StepRegistry';
import { Task } from '@core/Task/Task';

const projectSession = {
  projectId: 'test-project',
  index: {
    files: [
      { path: 'src/project/ProjectSession/ProjectSession.ts' },
      { path: 'src/project/Index/ProjectIndex.ts' },
      { path: 'src/cli/Cli.ts' },
    ],
  },
} as never;

const task = new Task({
  projectId: 'test-project',
  conversationId: 'test-conversation',
  description: 'Добавь /status без сканирования индекса.',
});

const logger = { info: async () => {}, warn: async () => {} } as never;
const configuration = { model: 'mock', temperature: 0, messageLayout: 'collapsed-user' } as never;

const knowledgePlanner = new RequirementResolutionPlanner(
  configuration,
  {
    complete: async () => ({
      content: JSON.stringify({
        status: 'planned',
        reason: 'Locate read-only current index access before deriving the fact.',
        goal: 'establish current index file-count access',
        root: 'fact:project.index.fileCount.access@cli',
        entries: [
          {
            ref: 'evidence:project.index.currentAccess',
            description: 'read-only current ProjectIndex access from ProjectSession',
            requires: [],
            evidenceKind: 'definition',
            sourceHints: ['src/project/ProjectSession/ProjectSession.ts'],
            constraints: ['read-only', 'existing-state', 'no-side-effects'],
          },
          {
            ref: 'fact:project.index.fileCount.access@cli',
            description: 'read current index file count without mutation',
            requires: ['evidence:project.index.currentAccess'],
            constraints: ['read-only'],
          },
        ],
      }),
    }),
  },
  projectSession,
  new StepRegistry(),
  logger,
);

const resolved = await knowledgePlanner.plan({
  task,
  executionId: 'execution-test',
  parentStep: {
    id: 'parent-understand',
    type: 'understand',
    action: 'determine-integration',
    subject: 'current index access',
    goal: 'determine current index access',
    status: 'pending',
    maxAttempts: 1,
    inputs: [],
    outputs: ['fact:project.index.fileCount.access@cli'],
  },
  requirement: {
    ref: 'fact:project.index.fileCount.access@cli',
    description: 'read current index file count without mutation',
    constraints: ['read-only', 'existing-state', 'no-side-effects', 'must-not-scan-or-refresh'],
  },
  evidence: [{ path: 'src/project/ProjectSession/ProjectSession.ts', symbol: 'scan', fact: 'scan() returns a ProjectIndex but mutates state.' }],
  facts: [],
  depth: 1,
});

if (!resolved) throw new Error('Requirement resolution planner returned no child plan');
if (resolved.mode !== 'knowledge') throw new Error(`Expected knowledge mode, got ${resolved.mode}`);
if (resolved.map.root.kind !== 'fact' || resolved.map.root.key !== 'project.index.fileCount.access') throw new Error('Child map changed the target requirement');
const root = resolved.map.entries.find((entry) => entry.ref.kind === 'fact' && entry.ref.key === 'project.index.fileCount.access');
if (!root?.constraints?.includes('must-not-scan-or-refresh')) throw new Error('Child resolution weakened parent constraints');
const types = resolved.plan.steps.map((step) => step.type).join(',');
if (types !== 'search,understand') throw new Error(`Resolution plan must gather only missing knowledge, got ${types}`);
if (resolved.plan.steps.some((step) => step.type === 'finalize' || step.type === 'edit-file')) throw new Error('Knowledge child requirement plan must not finalize or apply changes');

const capabilityPlanner = new RequirementResolutionPlanner(
  configuration,
  {
    complete: async () => ({
      content: JSON.stringify({
        status: 'add-capability',
        reason: 'No read-only accessor exists; expose the already-held index without scanning.',
        goal: 'expose read-only current index access',
        root: 'change-definition:project.index.currentAccess.support',
        recheck: 'evidence:project.index.currentAccess',
        entries: [
          {
            ref: 'evidence:project.session.index.field',
            description: 'existing ProjectSession index field',
            requires: [],
            evidenceKind: 'definition',
            sourceHints: ['src/project/ProjectSession/ProjectSession.ts'],
          },
          {
            ref: 'fact:project.index.support.change',
            description: 'minimal way to expose existing index without scan or refresh',
            requires: ['evidence:project.session.index.field'],
            constraints: ['read-only', 'no-side-effects'],
          },
          {
            ref: 'change-definition:project.index.currentAccess.support',
            description: 'minimal supporting accessor for the already-held current index',
            requires: ['fact:project.index.support.change'],
            targetPath: 'src/project/ProjectSession/ProjectSession.ts',
            constraints: ['minimal-change', 'read-only', 'no-side-effects'],
          },
        ],
      }),
    }),
  },
  projectSession,
  new StepRegistry(),
  logger,
);

const capability = await capabilityPlanner.plan({
  task,
  executionId: 'execution-capability-test',
  parentStep: {
    id: 'parent-search',
    type: 'search',
    action: 'find-definitions',
    subject: 'read-only current ProjectIndex access from ProjectSession',
    goal: 'find read-only current ProjectIndex access',
    status: 'pending',
    maxAttempts: 1,
    inputs: [],
    outputs: ['evidence:project.index.currentAccess'],
  },
  requirement: {
    ref: 'evidence:project.index.currentAccess',
    description: 'read-only current ProjectIndex access from ProjectSession',
    evidenceKind: 'definition',
    sourceHints: ['src/project/ProjectSession/ProjectSession.ts'],
    constraints: ['read-only', 'existing-state', 'no-side-effects', 'must-not-scan-or-refresh'],
  },
  evidence: [{ path: 'src/project/ProjectSession/ProjectSession.ts', symbol: 'scan', fact: 'Only scan/refresh access was found; both mutate the index.' }],
  facts: [],
  depth: 1,
});

if (!capability) throw new Error('Capability-addition resolution returned no child plan');
if (capability.mode !== 'capability-addition') throw new Error(`Expected capability-addition mode, got ${capability.mode}`);
if (capability.map.root.kind !== 'change-definition') throw new Error('Capability-addition root must be a change-definition');
const capabilityTypes = capability.plan.steps.map((step) => step.type).join(',');
if (capabilityTypes !== 'search,understand,prepare-change,edit-file') {
  throw new Error(`Capability child plan must gather, define, and apply one supporting change, got ${capabilityTypes}`);
}
if (capability.plan.steps.some((step) => step.type === 'finalize')) throw new Error('Capability child plan must not finalize the parent task');
const edit = capability.plan.steps.find((step) => step.type === 'edit-file');
if (edit?.targetPath !== 'src/project/ProjectSession/ProjectSession.ts') throw new Error('Capability edit target was not grounded to a project candidate');
const capabilityRoot = capability.map.entries.find((entry) => entry.ref.kind === 'change-definition');
if (!capabilityRoot?.constraints?.includes('must-not-scan-or-refresh')) throw new Error('Capability-addition weakened original constraints');
if (!capabilityRoot?.constraints?.includes('minimal-supporting-change')) throw new Error('Capability-addition lacks minimal-supporting-change guard');

console.log('## requirement resolution planner');
console.log('knowledge child plan keeps the exact missing requirement as root: OK');
console.log('constraints are preserved and knowledge resolution does not edit: OK');
console.log('capability-addition compiles one grounded supporting edit without finalize: OK');
console.log('capability-addition preserves original constraints and forces minimal support: OK');
console.log('PASS');
