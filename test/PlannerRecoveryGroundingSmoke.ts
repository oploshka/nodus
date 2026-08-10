// PlannerRecoveryGroundingSmoke.ts
import { PlanGenerator } from '@agent/Planning/PlanGenerator';
import { RecoveryController } from '@agent/Planning/RecoveryController';
import { StepRegistry } from '@agent/Planning/StepRegistry';
import type { TaskPlan } from '@agent/Planning/TaskPlan';
import { Execution } from '@core/Execution/Execution';
import { Task } from '@core/Task/Task';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const configuration = {
  provider: 'mock',
  model: 'mock',
  temperature: 0,
  maxTokens: 1024,
  messageLayout: 'collapsed-user',
} as const;
const logger = { info: async () => {}, warn: async () => {} } as never;
const registry = new StepRegistry();
const task = new Task({
  projectId: 'test-project',
  conversationId: 'test-conversation',
  description: 'Добавь /status: project ID, conversation ID и количество файлов в индексе.',
});

const planner = new PlanGenerator(
  configuration,
  {
    complete: async () => ({
      content: JSON.stringify({
        goal: 'Добавить /status',
        root: 'change-definition:status.command',
        entries: [
          {
            ref: 'evidence:project.id.definition',
            description: 'project ID source',
            requires: [],
            evidenceKind: 'definition',
            sourceHints: ['ProjectSession.ts'],
          },
          {
            ref: 'evidence:conversation.id.definition',
            description: 'conversation ID source',
            requires: [],
            evidenceKind: 'definition',
            sourceHints: ['Conversation.ts'],
          },
          {
            ref: 'evidence:project.index.files',
            description: 'project index files definition',
            requires: [],
            evidenceKind: 'definition',
            sourceHints: ['ProjectIndex.ts'],
          },
          {
            ref: 'fact:project.id.access@cli',
            description: 'how CLI accesses current project ID',
            requires: ['evidence:project.id.definition'],
          },
          {
            ref: 'fact:conversation.id.access@cli',
            description: 'how CLI accesses current conversation ID',
            requires: ['evidence:conversation.id.definition'],
          },
          {
            ref: 'fact:project.index.fileCount.access@cli',
            description: 'how CLI accesses project index file count',
            requires: ['evidence:project.index.files'],
          },
          {
            ref: 'change-definition:status.command',
            description: 'minimal /status change',
            requires: [
              'fact:project.id.access@cli',
              'fact:conversation.id.access@cli',
              'fact:project.index.fileCount.access@cli',
            ],
            targetPath: 'Cli.ts',
          },
        ],
      }),
    }),
  },
  {
    projectId: 'test-project',
    index: {
      files: [
        { path: 'src/cli/Cli.ts' },
        { path: 'src/project/ProjectSession/ProjectSession.ts' },
        { path: 'src/core/Conversation/Conversation.ts' },
        { path: 'src/project/Index/ProjectIndex.ts' },
      ],
    },
  } as never,
  logger,
  registry,
);

const plan = await planner.generate(task, 'planner-grounding-smoke');
const searches = plan.steps.filter((step) => step.type === 'search');
assert(searches.length === 3, `requirement compiler should create 3 evidence searches, got ${searches.length}`);
assert(searches.every((step) => step.action === 'find-definitions'), 'definition evidence must compile to find-definitions');
assert(searches.some((step) => step.subject?.includes('src/project/ProjectSession/ProjectSession.ts')), 'unique short ProjectSession.ts hint must resolve to the grounded project path');
assert(searches.some((step) => step.subject?.includes('src/core/Conversation/Conversation.ts')), 'unique short Conversation.ts hint must resolve to the grounded project path');
assert(plan.steps.find((step) => step.type === 'edit-file')?.targetPath === 'src/cli/Cli.ts', 'short Cli.ts target must resolve to the grounded project path');

const currentPlan: TaskPlan = {
  version: 2,
  goal: 'Find conversation ID source',
  steps: [{
    id: 'step-2',
    type: 'search',
    action: 'find-definitions',
    subject: 'conversation ID source in src/core/Conversation/Conversation.ts',
    goal: 'Find definitions: conversation ID source in src/core/Conversation/Conversation.ts',
    status: 'failed',
    maxAttempts: 1,
    inputs: [],
    outputs: ['conversation.id.source'],
  }],
};
const execution = new Execution(task.id);

const recovery = new RecoveryController(
  configuration,
  {
    complete: async () => ({
      content: JSON.stringify({
        action: 'insert-steps',
        reason: 'Find the exact identifier.',
        steps: [{
          id: 'recovery-1',
          type: 'search',
          action: 'find-definitions',
          subject: 'conversationId in src/core/Conversation/Conversation.ts',
          maxAttempts: 1,
          inputs: [],
          outputs: ['conversation.id.source'],
        }],
      }),
    }),
  },
  registry,
  logger,
);

const groundedDecision = await recovery.recover({
  task,
  execution,
  plan: currentPlan,
  stepIndex: 0,
  reason: 'исчерпан лимит попыток; не хватает: conversation ID source in src/core/Conversation/Conversation.ts',
  currentStepResult: {
    goalSatisfied: false,
    findings: [],
    evidence: [],
    missing: ['conversation ID source in src/core/Conversation/Conversation.ts'],
    facts: [],
  },
});
assert(groundedDecision.action === 'insert-steps', 'grounded recovery should keep a useful insert-steps decision');
assert(groundedDecision.steps[0]?.subject === 'conversation ID source in src/core/Conversation/Conversation.ts', 'recovery must replace guessed conversationId with the authoritative missing subject');
assert(!groundedDecision.steps[0]?.subject?.includes('conversationId'), 'recovery must not introduce an unevidenced code identifier');

const retryRecovery = new RecoveryController(
  configuration,
  {
    complete: async () => ({
      content: JSON.stringify({
        action: 'retry-current',
        reason: 'Try the same search again with a broader pattern.',
        steps: [],
      }),
    }),
  },
  registry,
  logger,
);
const retryDecision = await retryRecovery.recover({
  task,
  execution,
  plan: currentPlan,
  stepIndex: 0,
  reason: 'исчерпан лимит попыток шага',
  currentStepResult: {
    goalSatisfied: false,
    findings: [],
    evidence: [],
    missing: ['conversation ID source in src/core/Conversation/Conversation.ts'],
    facts: [],
  },
});
assert(retryDecision.action === 'request-human', 'semantic budget exhaustion without new evidence must not retry-current');

console.log('## Planner + recovery grounding smoke');
console.log('semantic evidence kinds compile to deterministic search actions: OK');
console.log('short source hints resolve only to grounded project paths: OK');
console.log('recovery cannot invent conversationId from conversation ID: OK');
console.log('semantic exhaustion cannot retry-current without new evidence: OK');
console.log('PASS');
