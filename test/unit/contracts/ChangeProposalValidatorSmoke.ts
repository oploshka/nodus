import { ChangeProposalValidator } from '@agent/Execution/ChangeProposalValidator';
import type { PreparedFileChange } from '@agent/Execution/ChangeExecutor';
import type { FileChange } from '@core/Change/ChangeSet';

const validator = new ChangeProposalValidator();
const contract = `Target: src/cli/Cli.ts
Intent: minimal /status command implementation
Established facts:
- fact:project.id.access@cli = configuration.project.id
- fact:conversation.id.access@cli = conversation.id
- fact:project.index.fileCount.access@cli = nodus.projectSession.index?.files.length
Constraints:
- no-side-effects-for-status-read`;

const good: FileChange = { type: 'patch', path: 'src/cli/Cli.ts', hunks: [{ oldStart: 1, oldCount: 0, newStart: 1, newCount: 7, lines: [
  { type: 'add', text: "{ name: '/status' }" },
  { type: 'add', text: "if (value === '/status') {" },
  { type: 'add', text: '  console.log(configuration.project.id);' },
  { type: 'add', text: '  console.log(conversation.id);' },
  { type: 'add', text: '  console.log(nodus.projectSession.index?.files.length ?? 0);' },
  { type: 'add', text: '  continue;' },
  { type: 'add', text: '}' },
] }] };
const goodPrepared: PreparedFileChange[] = [{ change: good, path: good.path, originalContent: 'continue;\n', resultingContent: "{ name: '/status' }\nif (value === '/status') {\n console.log(configuration.project.id);\n console.log(conversation.id);\n console.log(nodus.projectSession.index?.files.length ?? 0);\n continue;\n}\n" }];
validator.validate(contract, [good], goodPrepared);

const incomplete: FileChange = { type: 'patch', path: 'src/cli/Cli.ts', hunks: [{ oldStart: 1, oldCount: 0, newStart: 1, newCount: 1, lines: [{ type: 'add', text: "{ name: '/status' }" }] }] };
let rejected = false;
try { validator.validate(contract, [incomplete], [{ change: incomplete, path: incomplete.path, originalContent: 'continue;\n', resultingContent: "{ name: '/status' }\n" }]); }
catch { rejected = true; }
if (!rejected) throw new Error('Incomplete command proposal must be rejected before commit');

console.log('## change proposal validator');
console.log('complete proposal: OK');
console.log('incomplete proposal rejected: OK');
console.log('PASS');
