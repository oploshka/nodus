// FileSystemToolContractSmoke.ts
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalizeToolCallRequest } from '@model/Tool/Execution/ToolExecutor';
import { toolDefinitionsMessage, toolDescriptionsMessage } from '@model/Prompt/ModelInputComposer';
import { FileSystemTool } from '@model/Tool/FileSystem/FileSystemTool';

console.log('## file-system tool contract smoke');

const tool = new FileSystemTool();
const available = toolDefinitionsMessage([tool.definition]);
if (!available) throw new Error('file-system tool definition message missing');
if (!available.content.includes('action: read | write | list | delete | exists')) {
  throw new Error('model tool schema does not expose canonical file-system action field');
}
if (available.content.includes('operation: read')) {
  throw new Error('model tool schema should not advertise operation as the file-system action field');
}
console.log('model sees exact canonical input field names: OK');

const compact = toolDescriptionsMessage([tool.definition]);
if (!compact) throw new Error('compact tool description message missing');
if (compact.content.includes('Input fields') || compact.content.includes('action: read')) {
  throw new Error('compact tool description unexpectedly exposes schema details');
}
console.log('compact tool description preserves pre-schema prompt shape: OK');

const normalized = normalizeToolCallRequest({
  tool: 'file-system',
  input: { operation: 'read', path: 'Cli.ts' },
});
if (normalized.input.action !== 'read') throw new Error('legacy operation alias was not normalized to action');
if ('operation' in normalized.input) throw new Error('legacy operation alias survived canonical normalization');
console.log('legacy operation alias normalizes to action at tool boundary: OK');

const root = await mkdtemp(join(tmpdir(), 'nodus-file-system-contract-'));
try {
  await writeFile(join(root, 'Cli.ts'), 'const COMMANDS = [];\n', 'utf8');
  const result = await tool.execute(normalized.input, { projectRoot: root, exclude: [] });
  if (!result.ok || result.data !== 'const COMMANDS = [];\n') {
    throw new Error(`canonical file-system/read failed: ${result.error ?? 'unexpected result'}`);
  }
  console.log('canonical file-system/read executes successfully: OK');
} finally {
  await rm(root, { recursive: true, force: true });
}

console.log('PASS');
