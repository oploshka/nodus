// ModelInputMessagesSmoke.ts
import {
  activeEvidenceMessage,
  activeStepMessage,
  factsMessage,
  taskMessage,
  toolResultMessages,
} from '@model/Prompt/ModelInputComposer';

console.log('## Model input messages smoke test');

const facts = factsMessage([{
  key: 'project-index-structure',
  value: `src/project/Index/ProjectIndex.ts: File read succeeded. Content excerpt:\nexport interface ProjectIndex {\n  files: ProjectFileFact[];\n}`,
  evidence: [{
    path: 'src/project/Index/ProjectIndex.ts',
    fact: `File read succeeded. Content excerpt:\nexport interface ProjectIndex { files: ProjectFileFact[]; }`,
  }],
  producerStepId: 'step-1',
}]);
if (!facts) throw new Error('facts message missing');
if (facts.content.includes('export interface ProjectIndex')) throw new Error('reusable facts still contain copied source code');
if (!facts.content.includes('src/project/Index/ProjectIndex.ts')) throw new Error('reusable facts lost the source path');

const sourceMessages = toolResultMessages([{
  call: { tool: 'file-system', input: { action: 'read', path: 'src/project/Index/ProjectIndex.ts' } },
  result: { ok: true, data: 'export interface ProjectIndex {\n  files: ProjectFileFact[];\n}' },
}]);
if (sourceMessages.length !== 1) throw new Error('explicit source read should produce one source message');
if (!sourceMessages[0]?.content.includes('export interface ProjectIndex')) throw new Error('explicit source read lost source code');
if (!sourceMessages[0]?.content.includes('src/project/Index/ProjectIndex.ts')) throw new Error('explicit source read lost path');

const targetMessages = toolResultMessages([{
  call: { tool: 'file-system', input: { action: 'read', path: 'src/cli/Cli.ts' } },
  result: { ok: true, data: 'const COMMANDS = [];\n' },
}], 'src/cli/Cli.ts');
if (!targetMessages[0]?.content.includes('Target source file')) throw new Error('edit-file target source is not labeled as authoritative target context');

const messages = [
  taskMessage('Определи доступ к файлам индекса.'),
  activeStepMessage({ id: 'step-2', type: 'understand', action: 'trace-data-flow', subject: 'ProjectIndex.files', outputs: ['index.files.access'] }),
  facts,
  activeEvidenceMessage({ evidence: [{ path: 'src/project/ProjectSession/ProjectSession.ts', fact: 'Search match:59: this.index.files.length' }] }),
  ...sourceMessages,
].filter(Boolean);
if (messages.length < 5) throw new Error('input context was not split into independent messages');

console.log('reusable facts carry paths without copied source: OK');
console.log('full source appears only as transient source context: OK');
console.log('edit-file target source is explicitly labeled authoritative: OK');
console.log('task / contract / facts / evidence / source are separate messages: OK');
console.log('PASS: model input is layered while output protocol stays independent.');
