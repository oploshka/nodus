// PromptTemperatureContractSmoke.ts
import { composePrompt } from '@model/Prompt/PromptComposer';
import { DEFAULT_OPERATION_PROFILES } from '@operation/Default/DefaultOperationProfile';

console.log('## Operation profile + prompt composition smoke test');

const operations = new Map(DEFAULT_OPERATION_PROFILES.map((profile) => [profile.id, profile]));
for (const id of ['search', 'understand', 'prepare-change', 'edit-file', 'review', 'verify', 'resolve-failure']) {
  if (operations.get(id)?.model.temperature !== 0) throw new Error(`${id} must be deterministic (temperature=0)`);
}
if ((operations.get('finalize')?.model.temperature ?? 0) > 0.2) throw new Error('finalize temperature is unexpectedly high');

const search = operations.get('search');
if (!search) throw new Error('search operation profile missing');
const searchRules = search.prompt.rules.join('\n');
if (!searchRules.includes('activeStep.action + activeStep.subject')) throw new Error('search prompt is missing action/subject contract');
if (!searchRules.includes('Never return raw tool calls')) throw new Error('search prompt does not keep raw tool execution inside Nodus');
if (!search.prompt.returnFormat?.includes('Nodus compiles the queries into retrieval tool calls')) throw new Error('search return format is not query-only with deterministic runtime execution');
if (!search.execution.contextStrategy || search.execution.policyScopes.length === 0) throw new Error('search execution settings missing');

const composed = composePrompt(search.prompt);
if (!composed.includes('Purpose:')) throw new Error('composed prompt is missing purpose block');
if (!composed.includes('Rules:')) throw new Error('composed prompt is missing rules block');
if (!composed.includes('Return format:')) throw new Error('composed prompt is missing return format block');

console.log('model settings live inside operation profiles: OK');
console.log('search prompt is retrieval-only and action-scoped: OK');
console.log('prompt rules + return format compose from one profile: OK');
console.log('PASS: operation behavior is configured through one generalized profile shape.');
