import { EditFileRawProtocol } from '@model/Protocol/EditFileRawProtocol';

const protocol = new EditFileRawProtocol();
const result = protocol.parse(`STATUS completed
ACTION patch
PATH src/cli/Cli.ts
DIFF
--- a/src/cli/Cli.ts
+++ b/src/cli/Cli.ts
@@ -10,2 +10,3 @@
   { name: '/help', description: 'Help.' },
-  { name: '/stop', description: 'Stop.' }
+  { name: '/stop', description: 'Stop.' },
+  { name: '/status', description: 'Status.' }
@@ -40,3 +41,7 @@
       if (value === '/stop') {
         continue;
       }
+      if (value === '/status') {
+        console.log('status');
+        continue;
+      }`, 'src/cli/Cli.ts');

const change = result.changes[0];
if (!change || change.type !== 'patch') throw new Error('Expected patch change');
if (change.hunks.length !== 2) throw new Error('Expected two unified diff hunks');
if (!change.hunks[0].lines.some((line) => line.type === 'add' && line.text.includes('/status'))) throw new Error('First hunk must add /status command');
if (!change.hunks[1].lines.some((line) => line.type === 'add' && line.text.includes("value === '/status'"))) throw new Error('Second hunk must add /status handler');

const fallback = protocol.parse(`STATUS completed
ACTION write
PATH src/cli/Cli.ts
CONTENT
const value = 1;`, 'src/cli/Cli.ts');
if (fallback.changes[0]?.type !== 'write') throw new Error('Full write fallback must remain supported');

console.log('## edit-file patch protocol');
console.log('unified diff hunks parsed: OK');
console.log('full write fallback preserved: OK');
console.log('PASS');
