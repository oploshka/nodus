import { NodusResponseProtocol } from '../src/model/Protocol/NodusResponseProtocol';

const fakeTask = 'Add /status command using existing project, conversation and index APIs.';
const fakeCode = `if (value === '/status') {\n  console.log(\`project: \${configuration.project.id}\`);\n  console.log(\`conversation: \${conversation.id}\`);\n  console.log(\`files: \${nodus.projectSession.index.files.length}\`);\n}`;

const structured = {
  status: 'completed',
  message: 'Change prepared',
  findings: [
    'CLI command registration found in COMMANDS.',
    'Project and conversation IDs are available without duplicate logic.',
  ],
  facts: {
    'cli.status.target': 'src/cli/Cli.ts',
    'project.index.count': 'nodus.projectSession.index.files.length',
  },
  file: { path: 'src/cli/Cli.ts', content: fakeCode },
};

// Pretty JSON mirrors the style local instruction models commonly emit.
const jsonEquivalent = JSON.stringify(structured, null, 2);
const jsonMinified = JSON.stringify(structured);
const nodusEquivalent = NodusResponseProtocol.encode([
  { type: 'STATUS', argument: 'completed', body: '' },
  { type: 'MESSAGE', body: 'Change prepared' },
  { type: 'FINDING', body: 'CLI command registration found in COMMANDS.' },
  { type: 'FINDING', body: 'Project and conversation IDs are available without duplicate logic.' },
  { type: 'FACT', argument: 'cli.status.target', body: 'src/cli/Cli.ts' },
  { type: 'FACT', argument: 'project.index.count', body: 'nodus.projectSession.index.files.length' },
  { type: 'FILE', argument: 'src/cli/Cli.ts', body: fakeCode },
]);

const parsed = NodusResponseProtocol.parse(nodusEquivalent);
if (!parsed.complete) throw new Error('Expected complete protocol document');
if (parsed.sections.length !== 7) throw new Error(`Expected 7 sections, got ${parsed.sections.length}`);

// Simulate generation ending in the middle of the FILE body.
const truncated = nodusEquivalent.slice(0, nodusEquivalent.indexOf('console.log(`files:'));
const partial = NodusResponseProtocol.parse(truncated);
const completeSections = partial.sections.filter((section) => section.complete);
if (partial.complete) throw new Error('Truncated protocol must not be marked complete');
if (completeSections.length < 6) throw new Error('Completed sections should survive truncation');

const approxTokens = (value: string): number => Math.ceil(value.length / 4);
const deltaVsPretty = 1 - nodusEquivalent.length / jsonEquivalent.length;
const deltaVsMinified = 1 - nodusEquivalent.length / jsonMinified.length;

console.log('Nodus protocol smoke test');
console.log('-------------------------');
console.log(`Task: ${fakeTask}`);
console.log(`Pretty JSON:   ${jsonEquivalent.length} chars (~${approxTokens(jsonEquivalent)} tokens)`);
console.log(`Minified JSON: ${jsonMinified.length} chars (~${approxTokens(jsonMinified)} tokens)`);
console.log(`Nodus:         ${nodusEquivalent.length} chars (~${approxTokens(nodusEquivalent)} tokens)`);
console.log(`Delta vs pretty JSON:   ${(deltaVsPretty * 100).toFixed(1)}%`);
console.log(`Delta vs minified JSON: ${(deltaVsMinified * 100).toFixed(1)}%`);
console.log(`Full parse: ${parsed.complete ? 'OK' : 'FAIL'} (${parsed.sections.length} sections)`);
console.log(`Truncated parse: ${partial.complete ? 'unexpected complete' : 'partial'}; preserved ${completeSections.length} completed sections`);
console.log('');
console.log('Recovered facts from truncated response:');
for (const section of completeSections.filter((item) => item.type === 'FACT')) {
  console.log(`- ${section.argument}: ${section.body}`);
}
console.log('');
console.log('Decoded FILE preview:');
const file = parsed.sections.find((section) => section.type === 'FILE');
console.log(`${file?.argument ?? '?'} -> ${(file?.body ?? '').split('\n')[0] ?? ''}`);
console.log('');
console.log('PASS: protocol parses complete output and preserves completed sections after truncation.');
