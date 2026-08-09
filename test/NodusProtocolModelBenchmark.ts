import { performance } from 'node:perf_hooks';
import { ConfigurationLoader } from '@core/Configuration/ConfigurationLoader';
import { NodusResponseProtocol } from '../src/model/Protocol/NodusResponseProtocol';

type Format = 'json' | 'nodus';

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

interface RunResult {
  format: Format;
  elapsedMs: number;
  promptTokens?: number;
  completionTokens?: number;
  finishReason?: string;
  raw: string;
  parseOk: boolean;
  complete: boolean;
  recoveredUnits: number;
  summary: string;
}

const configPath = process.argv[2] ?? 'nodus.config.json';
const modeArg = (process.argv[3] ?? 'compare').toLowerCase();
const maxTokensArg = Number(process.argv[4] ?? '768');
const roundsArg = Number(process.argv[5] ?? (modeArg === 'compare' ? '2' : '1'));
const mode: 'json' | 'nodus' | 'compare' =
  modeArg === 'json' || modeArg === 'nodus' ? modeArg : 'compare';
const maxTokens = Number.isFinite(maxTokensArg) && maxTokensArg > 0 ? Math.floor(maxTokensArg) : 768;
const rounds = Number.isFinite(roundsArg) && roundsArg > 0 ? Math.min(5, Math.floor(roundsArg)) : 1;

const configuration = await ConfigurationLoader.load(configPath);
if (configuration.model.provider !== 'openai-compatible') {
  throw new Error('Protocol model benchmark requires model.provider=openai-compatible');
}
if (!configuration.model.endpoint) {
  throw new Error('Protocol model benchmark requires model.endpoint');
}

const endpoint = `${configuration.model.endpoint.replace(/\/$/, '')}/chat/completions`;

const fakeSource = buildFakeSource();
const requirements = [
  'The /status command must be registered exactly once.',
  'Project ID must come from configuration.project.id.',
  'Conversation ID must come from conversation.id.',
  'Indexed file count must come from nodus.projectSession.index.files.length.',
  'Do not duplicate existing project/session lookup logic.',
  'Do not modify unrelated commands.',
  'Keep output readable and consistent with the surrounding CLI style.',
  'Identify any correctness issue in the supplied implementation.',
  'Return at least 6 concise findings and at least 5 machine-readable facts.',
  'Return a corrected /status handler snippet if a correction is needed.',
];

console.log('Nodus protocol model benchmark');
console.log('------------------------------');
console.log(`Endpoint: ${endpoint}`);
console.log(`Model: ${configuration.model.model}`);
console.log(`Mode: ${mode}`);
console.log(`Max completion tokens: ${maxTokens}`);
console.log(`Rounds: ${rounds}${mode === 'compare' ? ' (order alternates to reduce cache/order bias)' : ''}`);
console.log(`Fake source: ${fakeSource.split('\n').length} lines, ${fakeSource.length} chars`);
console.log('Task: review a fake CLI implementation and return structured findings/facts.');
console.log('');

const results: RunResult[] = [];
for (let round = 0; round < rounds; round += 1) {
  const formats: Format[] = mode === 'compare'
    ? (round % 2 === 0 ? ['json', 'nodus'] : ['nodus', 'json'])
    : [mode];
  console.log(`Round ${round + 1}/${rounds} (${formats.map((item) => item.toUpperCase()).join(' -> ')})`);
  for (const format of formats) {
    console.log(`Running ${format.toUpperCase()}...`);
    const result = await run(format);
    results.push(result);
    printResult(result);
    console.log('');
  }
}

if (mode === 'compare') {
  const jsonRuns = results.filter((item) => item.format === 'json');
  const nodusRuns = results.filter((item) => item.format === 'nodus');
  const json = aggregate(jsonRuns);
  const nodus = aggregate(nodusRuns);
  console.log('Aggregate comparison');
  console.log('--------------------');
  printDelta('Average elapsed', json.elapsedMs, nodus.elapsedMs, 'ms');
  if (json.completionTokens !== undefined && nodus.completionTokens !== undefined) {
    printDelta('Average completion tokens', json.completionTokens, nodus.completionTokens, 'tokens');
  }
  console.log(`Parse success: JSON=${json.parseSuccess}/${jsonRuns.length}, Nodus=${nodus.parseSuccess}/${nodusRuns.length}`);
  console.log(`Semantic complete: JSON=${json.completeSuccess}/${jsonRuns.length}, Nodus=${nodus.completeSuccess}/${nodusRuns.length}`);
  console.log(`Average recoverable units: JSON=${json.recoveredUnits.toFixed(1)}, Nodus=${nodus.recoveredUnits.toFixed(1)}`);
}


function aggregate(items: RunResult[]): {
  elapsedMs: number;
  completionTokens?: number;
  recoveredUnits: number;
  parseSuccess: number;
  completeSuccess: number;
} {
  const elapsedMs = average(items.map((item) => item.elapsedMs));
  const tokenValues = items.flatMap((item) => item.completionTokens === undefined ? [] : [item.completionTokens]);
  return {
    elapsedMs,
    completionTokens: tokenValues.length > 0 ? average(tokenValues) : undefined,
    recoveredUnits: average(items.map((item) => item.recoveredUnits)),
    parseSuccess: items.filter((item) => item.parseOk).length,
    completeSuccess: items.filter((item) => item.complete).length,
  };
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

async function run(format: Format): Promise<RunResult> {
  const prompt = buildPrompt(format);
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
          content: '/no_think\nYou are a precise code reviewer. Answer immediately. Do not expose chain-of-thought. Follow the requested output protocol exactly.',
        },
        { role: 'user', content: prompt },
      ],
    }),
  });
  const elapsedMs = Math.round(performance.now() - startedAt);
  const payload = await response.json() as ApiResponse;
  if (!response.ok) {
    throw new Error(payload.error?.message ?? `Model request failed with HTTP ${response.status}`);
  }

  const raw = payload.choices?.[0]?.message?.content?.trim() ?? '';
  const finishReason = payload.choices?.[0]?.finish_reason;
  const analysis = format === 'json' ? analyzeJson(raw) : analyzeNodus(raw);
  return {
    format,
    elapsedMs,
    promptTokens: payload.usage?.prompt_tokens,
    completionTokens: payload.usage?.completion_tokens,
    finishReason,
    raw,
    ...analysis,
  };
}

function buildPrompt(format: Format): string {
  const base = `Review the fake TypeScript CLI below against the requirements.\n\nREQUIREMENTS:\n${requirements.map((item, index) => `${index + 1}. ${item}`).join('\n')}\n\nSOURCE:\n\`\`\`ts\n${fakeSource}\n\`\`\`\n\nKeep findings short. Do not discuss anything outside this fake source.`;

  if (format === 'json') {
    return `${base}\n\nReturn ONLY one JSON object with this exact top-level shape:\n{\n  "status": "completed",\n  "summary": "short summary",\n  "findings": ["..."],\n  "facts": [{"key":"...","value":"...","evidence":"..."}],\n  "correctedSnippet": "multiline TypeScript snippet or empty string"\n}\nNo markdown fences. Produce valid JSON. Escape multiline content correctly.`;
  }

  return `${base}\n\nReturn ONLY Nodus Response Protocol v1. Rules:\n1. Begin with <<<NODUS:1>>>.\n2. Every unit starts with a marker.\n3. Use exactly these section types: STATUS, SUMMARY, FINDING, FACT, SNIPPET.\n4. FACT marker argument is the fact key; body is the value followed by one line starting EVIDENCE: .\n5. SNIPPET body may contain raw multiline TypeScript without escaping.\n6. Finish with <<<END>>>.\n\nExample skeleton:\n<<<NODUS:1>>>\n<<<STATUS completed>>>\n<<<SUMMARY>>>\nshort summary\n<<<FINDING>>>\nshort finding\n<<<FACT cli.status.registered>>>\ntrue\nEVIDENCE: COMMANDS contains /status\n<<<SNIPPET>>>\nif (...) {\n  ...\n}\n<<<END>>>`;
}

function analyzeJson(raw: string): Pick<RunResult, 'parseOk' | 'complete' | 'recoveredUnits' | 'summary'> {
  const objectText = extractJsonObject(raw);
  if (!objectText) {
    return { parseOk: false, complete: false, recoveredUnits: recoverJsonKeys(raw), summary: 'No complete JSON object found' };
  }
  try {
    const value = JSON.parse(objectText) as {
      status?: unknown;
      summary?: unknown;
      findings?: unknown;
      facts?: unknown;
      correctedSnippet?: unknown;
    };
    const findings = Array.isArray(value.findings) ? value.findings.length : 0;
    const facts = Array.isArray(value.facts) ? value.facts.length : 0;
    const complete = value.status === 'completed' && findings >= 6 && facts >= 5 && typeof value.correctedSnippet === 'string';
    return {
      parseOk: true,
      complete,
      recoveredUnits: findings + facts + (typeof value.summary === 'string' ? 1 : 0) + (typeof value.correctedSnippet === 'string' ? 1 : 0),
      summary: `findings=${findings}, facts=${facts}`,
    };
  } catch (error) {
    return {
      parseOk: false,
      complete: false,
      recoveredUnits: recoverJsonKeys(raw),
      summary: `JSON parse failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function analyzeNodus(raw: string): Pick<RunResult, 'parseOk' | 'complete' | 'recoveredUnits' | 'summary'> {
  try {
    const document = NodusResponseProtocol.parse(stripFence(raw));
    const completeSections = document.sections.filter((section) => section.complete);
    const findings = completeSections.filter((section) => section.type === 'FINDING').length;
    const facts = completeSections.filter((section) => section.type === 'FACT').length;
    const hasStatus = completeSections.some((section) => section.type === 'STATUS' && section.argument === 'completed');
    const hasSnippet = completeSections.some((section) => section.type === 'SNIPPET');
    const complete = document.complete && hasStatus && findings >= 6 && facts >= 5 && hasSnippet;
    return {
      parseOk: true,
      complete,
      recoveredUnits: completeSections.length,
      summary: `sections=${completeSections.length}, findings=${findings}, facts=${facts}, documentComplete=${document.complete}`,
    };
  } catch (error) {
    return {
      parseOk: false,
      complete: false,
      recoveredUnits: 0,
      summary: `Protocol parse failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function printResult(result: RunResult): void {
  console.log(`  elapsed: ${formatMs(result.elapsedMs)}`);
  console.log(`  prompt tokens: ${result.promptTokens ?? 'unknown'}`);
  console.log(`  completion tokens: ${result.completionTokens ?? 'unknown'}`);
  console.log(`  finish reason: ${result.finishReason ?? 'unknown'}`);
  console.log(`  raw chars: ${result.raw.length}`);
  console.log(`  parse: ${result.parseOk ? 'OK' : 'FAIL'}`);
  console.log(`  semantic complete: ${yesNo(result.complete)}`);
  console.log(`  recoverable units: ${result.recoveredUnits}`);
  console.log(`  decoded: ${result.summary}`);
  console.log('  output preview:');
  for (const line of result.raw.split('\n').slice(0, 12)) console.log(`    ${line}`);
  if (result.raw.split('\n').length > 12) console.log('    ...');
}

function printDelta(label: string, jsonValue: number, nodusValue: number, unit: string): void {
  const delta = nodusValue - jsonValue;
  const percent = jsonValue === 0 ? 0 : (delta / jsonValue) * 100;
  const relation = delta < 0 ? 'less' : delta > 0 ? 'more' : 'same';
  console.log(`${label}: JSON=${Math.round(jsonValue)} ${unit}, Nodus=${Math.round(nodusValue)} ${unit} -> ${Math.abs(percent).toFixed(1)}% ${relation}`);
}

function extractJsonObject(raw: string): string | undefined {
  const text = stripFence(raw);
  const start = text.indexOf('{');
  if (start < 0) return undefined;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  return undefined;
}

function recoverJsonKeys(raw: string): number {
  const findingMatches = raw.match(/"findings"|"facts"|"summary"|"correctedSnippet"/g);
  return findingMatches?.length ?? 0;
}

function stripFence(raw: string): string {
  return raw
    .replace(/^```(?:json|text)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
}

function formatMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms}ms`;
}

function yesNo(value: boolean): string {
  return value ? 'YES' : 'NO';
}

function buildFakeSource(): string {
  const commandRows = [
    "  { name: '/scan', description: 'Scan project files.' },",
    "  { name: '/refresh', description: 'Refresh project files.' },",
    "  { name: '/conversation', description: 'Show current conversation ID.' },",
    "  { name: '/new', description: 'Create a new conversation.' },",
    "  { name: '/status', description: 'Show project status.' },",
    "  { name: '/exit', description: 'Exit the CLI.' },",
    "  { name: '/help', description: 'Show this help message.' },",
  ].join('\n');

  const noiseHandlers = Array.from({ length: 18 }, (_, index) => `
function renderDiagnostic${index + 1}(value: string): string {
  const normalized = value.trim();
  if (!normalized) return 'diagnostic-${index + 1}: empty';
  return \`diagnostic-${index + 1}: \${normalized.length}:\${normalized.slice(0, 24)}\`;
}`).join('\n');

  return `import type { Nodus } from '../core/Nodus/Nodus';
import type { Conversation } from '../core/Conversation/Conversation';
import type { NodusConfiguration } from '../core/Configuration/Configuration';

const COMMANDS = [
${commandRows}
];

export async function runCli(
  nodus: Nodus,
  conversation: Conversation,
  configuration: NodusConfiguration,
): Promise<void> {
  console.log('Commands: ' + COMMANDS.map((cmd) => cmd.name).join(' '));

  // Fake input loop omitted. Pretend value is the next command.
  const value = '/status';

  if (value === '/scan') {
    await nodus.projectSession.scan();
    return;
  }

  if (value === '/conversation') {
    console.log(conversation.id);
    return;
  }

  if (value === '/status') {
    // Intentional review bug: project ID is taken from conversation metadata
    // instead of the existing configuration.project.id source.
    const projectId = String(conversation.metadata.projectId ?? 'unknown');
    const conversationId = conversation.id;
    const indexedFiles = nodus.projectSession.index.files.length;
    console.log(\`Project: \${projectId}\`);
    console.log(\`Conversation: \${conversationId}\`);
    console.log(\`Indexed files: \${indexedFiles}\`);
    return;
  }

  if (value === '/help') {
    console.log('Available commands:');
    for (const command of COMMANDS) {
      console.log(\`\${command.name} - \${command.description}\`);
    }
    return;
  }
}

${noiseHandlers}
`;
}
