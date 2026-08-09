// EditFileProtocolSmoke.ts

interface EditPayload {
  status: 'completed';
  path: string;
  content: string;
}

const files: EditPayload[] = [
  {
    status: 'completed',
    path: 'src/fake/PathFormatter.ts',
    content: buildEscapingHeavySource('PathFormatter', 4),
  },
  {
    status: 'completed',
    path: 'src/fake/RequestLogger.ts',
    content: buildEscapingHeavySource('RequestLogger', 5),
  },
];

console.log('Single-file edit protocol smoke test');
console.log('------------------------------------');
console.log(`Scenario: ${files.length} files, one response per file`);
console.log('');

let totalJsonChars = 0;
let totalRawChars = 0;
for (const file of files) {
  const json = JSON.stringify(file);
  const raw = encodeRaw(file);
  const parsed = parseRaw(raw);
  if (!parsed || parsed.path !== file.path || parsed.content !== file.content) {
    throw new Error(`RAW protocol round-trip failed for ${file.path}`);
  }

  totalJsonChars += json.length;
  totalRawChars += raw.length;
  const jsonOverhead = json.length - file.content.length;
  const rawOverhead = raw.length - file.content.length;

  console.log(file.path);
  console.log(`  source:       ${file.content.length} chars`);
  console.log(`  JSON wire:    ${json.length} chars (${jsonOverhead} protocol/escaping overhead)`);
  console.log(`  RAW wire:     ${raw.length} chars (${rawOverhead} protocol overhead)`);
  console.log(`  RAW saving:   ${formatPercent(1 - raw.length / json.length)}`);
  console.log('');
}

console.log('Aggregate');
console.log(`  JSON wire:  ${totalJsonChars} chars (~${approxTokens(totalJsonChars)} tokens)`);
console.log(`  RAW wire:   ${totalRawChars} chars (~${approxTokens(totalRawChars)} tokens)`);
console.log(`  RAW saving: ${formatPercent(1 - totalRawChars / totalJsonChars)}`);
console.log('');
console.log('PASS: multi-file edits are represented as independent single-file responses.');

function encodeRaw(value: EditPayload): string {
  return `STATUS ${value.status}\nPATH ${value.path}\nCONTENT\n${value.content}`;
}

function parseRaw(value: string): EditPayload | undefined {
  const contentMarker = '\nCONTENT\n';
  const markerIndex = value.indexOf(contentMarker);
  if (markerIndex < 0) return undefined;

  const header = value.slice(0, markerIndex).split('\n');
  const status = header.find((line) => line.startsWith('STATUS '))?.slice('STATUS '.length).trim();
  const path = header.find((line) => line.startsWith('PATH '))?.slice('PATH '.length).trim();
  if (status !== 'completed' || !path) return undefined;

  return {
    status: 'completed',
    path,
    content: value.slice(markerIndex + contentMarker.length),
  };
}

function buildEscapingHeavySource(name: string, maxRetries: number): string {
  const repeated = Array.from({ length: 18 }, (_, index) => `  public rule${index + 1}(value: string): string {\n    const pattern = /^(?:[A-Z]:\\\\|\\\\\\\\)[^\"<>|?*]+$/i;\n    const json = '{\"rule\":${index + 1},\"enabled\":true,\"path\":\"C:\\\\\\\\temp\\\\\\\\nodus\"}';\n    const message = \`rule=${index + 1}\\nvalue=\"\${value}\"\\tpath=C:\\\\temp\\\\nodus\`;\n    return pattern.test(value) ? \`\${message}\\n\${json}\` : value.replace(/\\\\/g, '/');\n  }`).join('\n\n');

  return `// ${name}.ts\n\nexport class ${name} {\n  private readonly windowsRoot = 'C:\\\\work\\\\nodus\\\\src';\n  private readonly quoted = '\"quoted\" and \\\\ escaped';\n  private readonly multiline = \`first line\\nsecond line with \"quotes\"\\nthird \\\\ line\`;\n  private readonly payload = '{\"mode\":\"strict\",\"retry\":${maxRetries},\"path\":\"C:\\\\\\\\cache\\\\\\\\data\"}';\n\n  public readonly maxRetries = ${maxRetries};\n\n${repeated}\n}\n`;
}

function approxTokens(chars: number): number {
  return Math.ceil(chars / 4);
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}
