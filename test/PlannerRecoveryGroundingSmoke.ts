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
        steps: [
          {
            id: 'step-1',
            type: 'search',
            action: 'find-usages',
            subject: 'project ID retrieval logic in src/project/ProjectSession/ProjectSession.ts',
            maxAttempts: 1,
            inputs: [],
            outputs: ['project.id.source'],
          },
          {
            id: 'step-2',
            type: 'search',
            action: 'find-usages',
            subject: 'conversation ID retrieval logic in src/core/Conversation/Conversation.ts',
            maxAttempts: 1,
            inputs: ['project.id.source'],
            outputs: ['conversation.id.source'],
          },
          {
            id: 'step-3',
            type: 'search',
            action: 'find-usages',
            subject: 'index file count logic in src/project/Index/ProjectIndex.ts',
            maxAttempts: 1,
            inputs: ['conversation.id.source'],
            outputs: ['index.files.count.source'],
          },
          {
            id: 'step-4',
            type: 'finalize',
            action: 'summarize-result',
            subject: 'результат',
            maxAttempts: 1,
            inputs: ['index.files.count.source'],
            outputs: ['task.final-result'],
          },
        ],
      }),
    }),
  },
  {
    projectId: 'test-project',
    index: {
      files: [
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
for (const id of ['step-1', 'step-2', 'step-3']) {
  const step = plan.steps.find((candidate) => candidate.id === id);
  assert(step?.action === 'find-definitions', `${id} should normalize source/retrieval lookup to find-definitions, got ${step?.action}`);
}

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
console.log('value-source searches normalize to find-definitions: OK');
console.log('recovery cannot invent conversationId from conversation ID: OK');
console.log('semantic exhaustion cannot retry-current without new evidence: OK');
console.log('PASS');
