// ConservativeDerivationSmoke.ts
import { RecoveryController } from '@agent/Planning/RecoveryController';
import { StepRegistry } from '@agent/Planning/StepRegistry';
import type { PlanStep } from '@agent/Planning/TaskPlan';
import { Execution } from '@core/Execution/Execution';
import { Task } from '@core/Task/Task';
import { PromptRegistry } from '@model/Profile/PromptRegistry';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const task = new Task({ projectId: 'test-project', conversationId: 'test-conversation', description: 'add status command' });
const execution = new Execution(task.id);
const step: PlanStep = {
  id: 'understand-access',
  type: 'understand',
  goal: 'Уточнить доступ к данным в функции `runCli` для команды /status',
  status: 'pending',
  maxAttempts: 1,
  inputs: ['cli.structure', 'project.index.access'],
  outputs: ['cli.status.access'],
};

const sourceFacts = [
  {
    key: 'cli.structure',
    value: 'runCli owns configuration, conversation and nodus.',
    producerStepId: 'search-cli',
    evidence: [{
      path: 'src/cli/Cli.ts',
      symbol: 'runCli',
      fact: 'runCli contains configuration.project.id, conversation.id, nodus.projectSession.scan(), and index.files.length after scan/refresh.',
    }],
  },
  {
    key: 'project.index.access',
    value: 'ProjectSession exposes index and files.',
    producerStepId: 'search-index',
    evidence: [{
      path: 'src/project/ProjectSession/ProjectSession.ts',
      symbol: 'ProjectSession',
      fact: 'ProjectSession has this.index and ProjectIndex has files.',
    }],
  },
];

const logger = { info: async () => {}, warn: async () => {} } as never;
const config = { provider: 'mock', model: 'mock', temperature: 0, maxTokens: 256 } as never;

const hallucinating = new RecoveryController(
  config,
  {
    complete: async () => ({
      content: JSON.stringify({
        satisfied: true,
        reason: 'Use task state.',
        missing: [],
        facts: [{ key: 'cli.status.access', value: 'Use state.task.projectId and this.index.files.length inside runCli.' }],
      }),
    }),
  },
  new PromptRegistry(),
  new StepRegistry(),
  logger,
);

const rejected = await hallucinating.assessStepSatisfaction({ task, execution, step, facts: sourceFacts });
assert(!rejected.satisfied, 'ungrounded receiver chains must not satisfy understand');
assert(rejected.facts.length === 0, 'rejected derived fact must not enter ExecutionContext');
assert(rejected.reason.includes('state.task') || rejected.reason.includes('this.index'), 'rejection should identify ungrounded access');

const grounded = new RecoveryController(
  config,
  {
    complete: async () => ({
      content: JSON.stringify({
        satisfied: true,
        reason: 'Use values already available in runCli.',
        missing: [],
        facts: [{
          key: 'cli.status.access',
          value: 'Use configuration.project.id, conversation.id and nodus.projectSession with index.files.length inside runCli.',
        }],
      }),
    }),
  },
  new PromptRegistry(),
  new StepRegistry(),
  logger,
);

const accepted = await grounded.assessStepSatisfaction({ task, execution, step, facts: sourceFacts });
assert(accepted.satisfied, 'grounded access chains should satisfy understand');
assert(accepted.facts[0]?.key === 'cli.status.access', 'grounded fact should preserve exact output key');

console.log('## Conservative derivation smoke test');
console.log('state.task / this.index scope substitution rejected: OK');
console.log('configuration.project.id / conversation.id / nodus.projectSession accepted: OK');
console.log('PASS: semantic derivation cannot replace source-scoped access paths with unrelated receivers.');
