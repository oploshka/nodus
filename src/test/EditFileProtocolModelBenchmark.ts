// EditFileProtocolModelBenchmark.ts

import { performance } from 'node:perf_hooks';
import { ConfigurationLoader } from '@core/Configuration/ConfigurationLoader';

type Format = 'json' | 'raw';

interface ApiResponse {
  choices?: Array<{
    message?: {
      content?: string;
      reasoning_content?: string;
    };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: { message?: string };
}

interface FakeEditCase {
  path: string;
  source: string;
  expectedMarker: string;
  instruction: string;
}

interface ParsedEdit {
  status: string;
  path: string;
  content: string;
}

interface RunResult {
  format: Format;
  file: string;
  elapsedMs: number;
  promptTokens?: number;
  completionTokens?: number;
  finishReason?: string;
  rawChars: number;
  decodedChars: number;
  wireOverheadChars: number;
  parseOk: boolean;
  semanticComplete: boolean;
  raw: string;
}

const configPath = process.argv[2] ?? 'nodus.config.json';
const modeArg = (process.argv[3] ?? 'compare').toLowerCase();
const maxTokensArg = Number(process.argv[4] ?? '1536');
const roundsArg = Number(process.argv[5] ?? '1');
const mode: 'json' | 'raw' | 'compare' = modeArg === 'json' || modeArg === 'raw' ? modeArg : 'compare';
const maxTokens = Number.isFinite(maxTokensArg) && maxTokensArg > 0 ? Math.floor(maxTokensArg) : 1536;
const rounds = Number.isFinite(roundsArg) && roundsArg > 0 ? Math.min(4, Math.floor(roundsArg)) : 1;

const configuration = await ConfigurationLoader.load(configPath);
if (configuration.model.provider !== 'openai-compatible') {
  throw new Error('Edit-file model benchmark requires model.provider=openai-compatible');
}
if (!configuration.model.endpoint) {
  throw new Error('Edit-file model benchmark requires model.endpoint');
}

const endpoint = `${configuration.model.endpoint.replace(/\/$/, '')}/chat/completions`;
const cases = buildCases();

console.log('Nodus single-file edit model benchmark');
console.log('--------------------------------------');
console.log(`Endpoint: ${endpoint}`);
console.log(`Model: ${configuration.model.model}`);
console.log(`Mode: ${mode}`);
console.log(`Max completion tokens: ${maxTokens}`);
console.log(`Rounds: ${rounds}${mode === 'compare' ? ' (format order alternates)' : ''}`);
console.log(`Files per format: ${cases.length} (each file is a separate model response)`);
console.log(`Fake source total: ${cases.reduce((sum, item) => sum + item.source.length, 0)} chars`);
console.log('Goal: measure JSON escaping cost against STATUS/PATH + raw source to EOF.');
console.log('');

printStaticSerialization(cases);

const results: RunResult[] = [];
for (let round = 0; round < rounds; round += 1) {
  const formats: Format[] = mode === 'compare'
    ? (round % 2 === 0 ? ['json', 'raw'] : ['raw', 'json'])
    : [mode];

  console.log(`Round ${round + 1}/${rounds} (${formats.map((item) => item.toUpperCase()).join(' -> ')})`);
  for (const format of formats) {
    for (let fileIndex = 0; fileIndex < cases.length; fileIndex += 1) {
      const editCase = cases[fileIndex];
      console.log(`Running ${format.toUpperCase()} ${fileIndex + 1}/${cases.length}: ${editCase.path}`);
      const result = await run(format, editCase);
      results.push(result);
      printResult(result);
      console.log('');
    }
  }
}

if (mode === 'compare') {
  console.log('Aggregate comparison');
  console.log('--------------------');
  const json = aggregate(results.filter((item) => item.format === 'json'));
  const raw = aggregate(results.filter((item) => item.format === 'raw'));
  printDelta('Total/average elapsed', json.elapsedMs, raw.elapsedMs, 'ms');
  if (json.completionTokens !== undefined && raw.completionTokens !== undefined) {
    printDelta('Completion tokens', json.completionTokens, raw.completionTokens, 'tokens');
  }
  printDelta('Wire chars', json.rawChars, raw.rawChars, 'chars');
  printDelta('Protocol + escaping overhead', json.wireOverheadChars, raw.wireOverheadChars, 'chars');
  console.log(`Parse success: JSON=${json.parseSuccess}/${json.count}, RAW=${raw.parseSuccess}/${raw.count}`);
  console.log(`Semantic complete: JSON=${json.semanticSuccess}/${json.count}, RAW=${raw.semanticSuccess}/${raw.count}`);
  console.log('');
  console.log('Interpretation: elapsed time matters only when both formats are semantically complete.');
  console.log('If max_tokens truncates one format, compare completion tokens + finish reason + semantic completion first.');
}

async function run(format: Format, editCase: FakeEditCase): Promise<RunResult> {
  const startedAt = performance.now();
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(configuration.model.apiKey ? { authorization: `Bearer ${configuration.model.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: configuration.model.model,
      temperature: 0,
      max_tokens: maxTokens,
      messages: [
        {
          role: 'system',
          content: 'You are a precise code editor. Do not expose chain-of-thought. Preserve unrelated code exactly where practical. Follow the requested response format exactly.',
        },
        { role: 'user', content: buildPrompt(format, editCase) },
      ],
    }),
  });
  const elapsedMs = Math.round(performance.now() - startedAt);
  const payload = await response.json() as ApiResponse;
  if (!response.ok) {
    throw new Error(payload.error?.message ?? `Model request failed with HTTP ${response.status}`);
  }

  const raw = payload.choices?.[0]?.message?.content?.trim() ?? '';
  const parsed = format === 'json' ? parseJson(raw) : parseRaw(raw);
  const parseOk = Boolean(parsed);
  const semanticComplete = Boolean(
    parsed
    && parsed.status === 'completed'
    && parsed.path === editCase.path
    && parsed.content.includes(editCase.expectedMarker)
    && parsed.content.split('\n').length >= Math.floor(editCase.source.split('\n').length * 0.75),
  );
  const decodedChars = parsed?.content.length ?? 0;

  return {
    format,
    file: editCase.path,
    elapsedMs,
    promptTokens: payload.usage?.prompt_tokens,
    completionTokens: payload.usage?.completion_tokens,
    finishReason: payload.choices?.[0]?.finish_reason,
    rawChars: raw.length,
    decodedChars,
    wireOverheadChars: Math.max(0, raw.length - decodedChars),
    parseOk,
    semanticComplete,
    raw,
  };
}

function buildPrompt(format: Format, editCase: FakeEditCase): string {
  const base = `Edit exactly ONE file.\n\nPATH: ${editCase.path}\nTASK: ${editCase.instruction}\n\nRules:\n- Return the complete updated file content, not a diff.\n- Preserve unrelated lines and escaping-heavy strings/regex/template literals.\n- Do not edit or mention any other file.\n\nCURRENT SOURCE:\n\`\`\`ts\n${editCase.source}\n\`\`\``;

  if (format === 'json') {
    return `${base}\n\nReturn ONLY valid minified JSON with exactly these fields:\n{"status":"completed","path":"${editCase.path}","content":"FULL UPDATED TYPESCRIPT"}\nThe content field must contain the complete file and therefore all newlines, quotes and backslashes must be valid JSON escaping. No markdown fences.`;
  }

  return `${base}\n\nReturn ONLY this simple protocol:\nSTATUS completed\nPATH ${editCase.path}\nCONTENT\n<complete updated TypeScript from here until end of response>\n\nImportant: after the CONTENT line output raw TypeScript directly. Do not escape it. Do not add a closing marker or markdown fence.`;
}

function parseJson(raw: string): ParsedEdit | undefined {
  const object = extractJsonObject(raw);
  if (!object) return undefined;
  try {
    const parsed = JSON.parse(object) as Record<string, unknown>;
    if (typeof parsed.status !== 'string' || typeof parsed.path !== 'string' || typeof parsed.content !== 'string') return undefined;
    return { status: parsed.status, path: parsed.path, content: parsed.content };
  } catch {
    return undefined;
  }
}

function parseRaw(raw: string): ParsedEdit | undefined {
  const marker = '\nCONTENT\n';
  const index = raw.indexOf(marker);
  if (index < 0) return undefined;
  const header = raw.slice(0, index).split('\n').map((line) => line.trim()).filter(Boolean);
  const status = header.find((line) => line.startsWith('STATUS '))?.slice('STATUS '.length).trim();
  const path = header.find((line) => line.startsWith('PATH '))?.slice('PATH '.length).trim();
  if (!status || !path) return undefined;
  return { status, path, content: raw.slice(index + marker.length) };
}

function extractJsonObject(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed;
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  return start >= 0 && end > start ? trimmed.slice(start, end + 1) : undefined;
}

function printResult(result: RunResult): void {
  console.log(`  elapsed: ${formatMs(result.elapsedMs)}`);
  console.log(`  prompt tokens: ${result.promptTokens ?? 'unknown'}`);
  console.log(`  completion tokens: ${result.completionTokens ?? 'unknown'}`);
  console.log(`  finish reason: ${result.finishReason ?? 'unknown'}`);
  console.log(`  wire chars: ${result.rawChars}`);
  console.log(`  decoded source chars: ${result.decodedChars}`);
  console.log(`  protocol/escaping overhead: ${result.wireOverheadChars}`);
  console.log(`  parse: ${result.parseOk ? 'OK' : 'FAIL'}`);
  console.log(`  semantic complete: ${result.semanticComplete ? 'YES' : 'NO'}`);
  console.log('  output preview:');
  console.log(indent(result.raw.slice(0, 520)));
  if (result.raw.length > 520) console.log('    ...');
}

function printStaticSerialization(items: FakeEditCase[]): void {
  let jsonChars = 0;
  let rawChars = 0;
  let contentChars = 0;
  for (const item of items) {
    const payload: ParsedEdit = { status: 'completed', path: item.path, content: item.source };
    const json = JSON.stringify(payload);
    const raw = `STATUS completed\nPATH ${item.path}\nCONTENT\n${item.source}`;
    jsonChars += json.length;
    rawChars += raw.length;
    contentChars += item.source.length;
  }

  console.log('Static serialization preflight (identical fake source, no model)');
  console.log(`  decoded source: ${contentChars} chars`);
  console.log(`  JSON wire:      ${jsonChars} chars (overhead ${jsonChars - contentChars})`);
  console.log(`  RAW wire:       ${rawChars} chars (overhead ${rawChars - contentChars})`);
  console.log(`  RAW wire delta: ${formatDelta(jsonChars, rawChars)}`);
  console.log('');
}

function aggregate(items: RunResult[]) {
  const completion = items.map((item) => item.completionTokens).filter((value): value is number => value !== undefined);
  return {
    count: items.length,
    elapsedMs: sum(items.map((item) => item.elapsedMs)),
    completionTokens: completion.length === items.length ? sum(completion) : undefined,
    rawChars: sum(items.map((item) => item.rawChars)),
    wireOverheadChars: sum(items.map((item) => item.wireOverheadChars)),
    parseSuccess: items.filter((item) => item.parseOk).length,
    semanticSuccess: items.filter((item) => item.semanticComplete).length,
  };
}

function printDelta(label: string, baseline: number, candidate: number, unit: string): void {
  const delta = baseline === 0 ? 0 : (candidate / baseline - 1) * 100;
  const relation = delta < 0 ? `${Math.abs(delta).toFixed(1)}% less` : `${delta.toFixed(1)}% more`;
  console.log(`${label}: JSON=${Math.round(baseline)} ${unit}, RAW=${Math.round(candidate)} ${unit} -> ${relation}`);
}

function buildCases(): FakeEditCase[] {
  return [
    {
      path: 'src/fake/PathFormatter.ts',
      source: buildEscapingHeavySource('PathFormatter', 3, 'BROKEN_MAX_RETRIES = 3'),
      expectedMarker: 'MAX_RETRIES = 4',
      instruction: 'Replace the declaration BROKEN_MAX_RETRIES = 3 with MAX_RETRIES = 4 and update references to that constant. Do not make any other semantic change.',
    },
    {
      path: 'src/fake/RequestLogger.ts',
      source: buildEscapingHeavySource('RequestLogger', 2, 'BROKEN_LOG_LEVEL = \'warn\''),
      expectedMarker: "LOG_LEVEL = 'info'",
      instruction: "Replace BROKEN_LOG_LEVEL = 'warn' with LOG_LEVEL = 'info' and update references to that constant. Do not make any other semantic change.",
    },
  ];
}

function buildEscapingHeavySource(name: string, seed: number, brokenDeclaration: string): string {
  const methods = Array.from({ length: 16 }, (_, index) => {
    const n = index + 1;
    return `  public transform${n}(input: string): string {\n    const windows = \`C:\\\\work\\\\nodus\\\\case-${n}\\\\\${input}\`;\n    const regex = /^(?:[A-Z]:\\\\|\\\\\\\\)(?:[^\"<>|?*]+\\\\?)+$/i;\n    const embeddedJson = '{\"index\":${n},\"enabled\":true,\"quote\":\"\\\\\\\"ok\\\\\\\"\",\"path\":\"C:\\\\\\\\temp\\\\\\\\nodus\"}';\n    const message = \`name=${name}\\nindex=${n}\\tinput=\"\${input}\"\\npath=\${windows}\`;\n    return regex.test(windows) ? \`\${message}\\njson=\${embeddedJson}\` : input.replace(/\\\\/g, '/');\n  }`;
  }).join('\n\n');

  const reference = brokenDeclaration.includes('RETRIES') ? 'BROKEN_MAX_RETRIES' : 'BROKEN_LOG_LEVEL';
  return `// ${name}.ts\n\nconst ${brokenDeclaration};\n\nexport class ${name} {\n  private readonly root = 'C:\\\\projects\\\\nodus\\\\src';\n  private readonly doubleQuoted = \"value with \\\"quotes\\\" and \\\\slashes\\\\\";\n  private readonly regexText = '^C:\\\\\\\\(?:work|temp)\\\\\\\\[^\\\"<>|?*]+$';\n  private readonly template = \`first\\nsecond \"quoted\"\\nthird \\\\ backslash\\nseed=${seed}\`;\n  private readonly configText = '{\"mode\":\"strict\",\"nested\":{\"enabled\":true},\"path\":\"C:\\\\\\\\cache\\\\\\\\data\"}';\n\n  public currentSetting(): string | number {\n    return ${reference};\n  }\n\n${methods}\n}\n`;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function formatMs(value: number): string {
  return `${(value / 1000).toFixed(2)}s`;
}

function formatDelta(baseline: number, candidate: number): string {
  const delta = baseline === 0 ? 0 : (candidate / baseline - 1) * 100;
  return delta <= 0 ? `${Math.abs(delta).toFixed(1)}% smaller` : `${delta.toFixed(1)}% larger`;
}

function indent(value: string): string {
  return value.split('\n').map((line) => `    ${line}`).join('\n');
}
