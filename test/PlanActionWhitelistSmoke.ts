// PlanActionWhitelistSmoke.ts
import { StepRegistry } from '@agent/Planning/StepRegistry';
import { STATUS_COMMAND_CANONICAL_PLAN } from './scenario/status/StatusCommandScenario';

console.log('## Plan action whitelist smoke test');

const registry = new StepRegistry();

for (const step of STATUS_COMMAND_CANONICAL_PLAN.steps) {
  if (!step.action) throw new Error(`${step.id}: action is missing`);
  if (!registry.hasAction(step.type, step.action)) {
    throw new Error(`${step.id}: action ${step.action} is not allowed for ${step.type}`);
  }
  if (!step.subject?.trim()) throw new Error(`${step.id}: subject is missing`);
}

if (registry.hasAction('search', 'determine-integration')) {
  throw new Error('search must not accept understand actions');
}
if (registry.hasAction('understand', 'find-files')) {
  throw new Error('understand must not accept search actions');
}

const searchActions = registry.get('search').actions.map((action) => action.id);
for (const required of ['find-files', 'find-symbols', 'find-definitions', 'find-usages', 'find-references', 'find-examples']) {
  if (!searchActions.includes(required as typeof searchActions[number])) {
    throw new Error(`search whitelist is missing ${required}`);
  }
}

console.log('planner steps use type-specific whitelisted actions: OK');
console.log('search and understand action vocabularies cannot be mixed: OK');
console.log('search is expressed through concrete retrieval primitives: OK');
console.log('PASS: plan semantics are constrained by operation + action + subject.');
