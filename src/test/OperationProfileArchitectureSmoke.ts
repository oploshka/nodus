// OperationProfileArchitectureSmoke.ts
import { readFile } from 'node:fs/promises';
import { DEFAULT_OPERATION_PROFILES } from '@operation/Default/DefaultOperationProfile';

console.log('## Operation profile architecture smoke test');

for (const profile of DEFAULT_OPERATION_PROFILES) {
  if (!profile.prompt?.purpose || !Array.isArray(profile.prompt.rules)) throw new Error(`${profile.id}: prompt settings missing`);
  if (!profile.model || !profile.execution) throw new Error(`${profile.id}: grouped settings missing`);
}

const nodusSource = await readFile(new URL('../core/Nodus/Nodus.ts', import.meta.url), 'utf8');
if (nodusSource.includes('PromptRegistry')) throw new Error('Nodus still wires the legacy PromptRegistry');

const modelSource = await readFile(new URL('../model/Controller/ModelController.ts', import.meta.url), 'utf8');
if (modelSource.includes('promptRegistry')) throw new Error('ModelController still depends on the legacy PromptRegistry');

console.log('all operations expose prompt/model/execution groups: OK');
console.log('legacy central PromptRegistry removed from runtime wiring: OK');
console.log('PASS: model-call settings are generalized while operation settings remain next to operation code.');
