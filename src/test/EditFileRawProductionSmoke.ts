import { EditFileRawProtocol } from '@model/Protocol/EditFileRawProtocol';

const protocol = new EditFileRawProtocol();

const rawWrite = [
  'STATUS completed',
  'ACTION write',
  'PATH src/fake/Test.ts',
  'CONTENT',
  "export const value = `line 1\\nline 2`;",
  "export const regex = /^C:\\\\work\\\\.+$/;",
].join('\n');

const write = protocol.parse(rawWrite, 'src/fake/Test.ts');
if (write.status !== 'completed' || write.changes.length !== 1 || write.changes[0]?.type !== 'write') {
  throw new Error('RAW write parse failed');
}
if (!write.changes[0].content.includes('line 2') || !write.changes[0].content.includes('regex')) {
  throw new Error('RAW content was not preserved');
}

const rawDelete = ['STATUS completed', 'ACTION delete', 'PATH src/fake/Old.ts'].join('\n');
const deletion = protocol.parse(rawDelete, 'src/fake/Old.ts');
if (deletion.changes[0]?.type !== 'delete') throw new Error('RAW delete parse failed');

const rawTool = ['STATUS continue', 'TOOL file-system', 'INPUT {"action":"read","path":"src/fake/Test.ts"}'].join('\n');
const tool = protocol.parse(rawTool, 'src/fake/Test.ts');
if (tool.status !== 'continue' || tool.toolCalls.length !== 1) throw new Error('RAW tool-call parse failed');

let mismatchRejected = false;
try { protocol.parse(rawWrite, 'src/fake/Other.ts'); } catch { mismatchRejected = true; }
if (!mismatchRejected) throw new Error('Target path mismatch must be rejected');

console.log('## Production edit-file RAW protocol smoke test');
console.log('write: OK');
console.log('delete: OK');
console.log('tool-call: OK');
console.log('target-path guard: OK');
console.log(`decoded write chars: ${write.changes[0].type === 'write' ? write.changes[0].content.length : 0}`);
console.log('PASS: edit-file protocol supports one guarded file per model response.');
