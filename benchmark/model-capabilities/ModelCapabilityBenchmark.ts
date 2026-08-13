import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { ConfigurationLoader } from '@app/Config/ConfigurationLoader.js';
import { FileLogger } from '@app/Logging/Logger.js';
import { Project } from '@engine/Project/Project.js';
import type { PlanStep } from '@engine/Planner/Plan.js';
import type { EngineLogger } from '@engine/Type/EngineLogger.js';
import type { LanguageConfiguration } from '@engine/Type/LanguageConfiguration.js';
import { ChangeCodeDiffAction } from '@engine/Worker/Action/ChangeCodeDiffAction.js';
import { ChangeCodeEditAction } from '@engine/Worker/Action/ChangeCodeEditAction.js';
import { ChangeCodeRangeReplaceAction } from '@engine/Worker/Action/ChangeCodeRangeReplaceAction.js';
import { ChangeCodeReplaceAction } from '@engine/Worker/Action/ChangeCodeReplaceAction.js';
import type { WorkerAction } from '@engine/Worker/Action/WorkerAction.js';
import { CodeWorker } from '@engine/Worker/CodeWorker.js';
import type { WorkerResult } from '@engine/Worker/Worker.js';
import { Task } from '@engine/Task/Task.js';
import type { ModelAdapter, RawModelResponse } from '@model/Adapter/ModelAdapter.js';
import { OpenAICompatibleModelAdapter } from '@model/Adapter/OpenAICompatibleModelAdapter.js';
import type { ModelRequest } from '@model/Request/ModelRequest.js';
import { ModelRunner } from '@model/Runner/ModelRunner.js';

type StrategyId = 'replace' | 'range-replace' | 'diff' | 'edit';

interface BenchmarkEdit {
  path: string;
  instruction: string;
}

interface BenchmarkCase {
  id: string;
  description: string;
  files: Record<string, string>;
  expected: Record<string, string>;
  edits: BenchmarkEdit[];
}

interface ForwardedCallMetric {
  durationMs: number;
  request: string;
  response: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  finishReason?: string;
}

interface CaseResult {
  timestamp: string;
  strategy: StrategyId;
  caseId: string;
  status: WorkerResult['status'];
  correct: boolean;
  unchangedOutsideExpected: boolean;
  durationMs: number;
  modelCalls: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  reason?: string;
  logPath: string;
}

const LANGUAGE: LanguageConfiguration = {
  project: 'en',
  nodus: 'en',
  response: 'en',
};

const PROFILE = {
  purpose: 'Modify source code according to one already-specified benchmark edit.',
  guidance: [
    'This is a deterministic model capability benchmark.',
    'The requested edit is already known; do not broaden the task or change unrelated source.',
    'Preserve all unrelated content exactly whenever the strategy permits it.',
  ].join('\n'),
  language: LANGUAGE,
};


/**
 * Benchmark-only Project implementation.
 *
 * CodeWorker and real ChangeCode*Action classes still see the normal Project
 * contract, but reads/writes are backed by an in-memory map. This keeps the
 * benchmark focused on model -> Action contract -> applicator behavior and
 * avoids filesystem copying/commit noise.
 */
class InMemoryBenchmarkProject extends Project {
  private readonly files: Map<string, string>;

  public constructor(id: string, initialFiles: Record<string, string>, logger: EngineLogger) {
    super({
      id,
      root: resolve('.'),
      scanMode: 'manual',
      include: ['src/**/*.ts'],
      exclude: ['node_modules', 'dist', '.git', '.nodus'],
    }, logger);
    this.files = new Map(Object.entries(initialFiles).map(([path, content]) => [this.normalizeMemoryPath(path), content]));
  }

  public override async resolvePath(path: string): Promise<string> {
    const normalized = this.normalizeMemoryPath(path);
    if (!this.files.has(normalized)) throw new Error(`In-memory project file does not exist: ${normalized}`);
    return normalized;
  }

  public override async resolveTargetPath(path: string): Promise<string> {
    return this.normalizeMemoryPath(path);
  }

  public override async read(path: string): Promise<string> {
    const normalized = await this.resolvePath(path);
    const content = this.files.get(normalized);
    if (content === undefined) throw new Error(`In-memory project file does not exist: ${normalized}`);
    return content;
  }

  public override async write(path: string, content: string): Promise<void> {
    const normalized = await this.resolveTargetPath(path);
    this.files.set(normalized, content);
  }

  public content(path: string): string | undefined {
    return this.files.get(this.normalizeMemoryPath(path));
  }

  private normalizeMemoryPath(path: string): string {
    const normalized = path.replace(/\\/g, '/').replace(/^\.\//, '');
    if (!normalized || normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized)) {
      throw new Error(`Invalid in-memory project path: ${path}`);
    }
    const parts = normalized.split('/');
    if (parts.some((part) => part === '..' || part === '')) throw new Error(`Invalid in-memory project path: ${path}`);
    return parts.filter((part) => part !== '.').join('/');
  }
}

const CASES: BenchmarkCase[] = [
  {
    id: 'single-line',
    description: 'Replace one literal with a constructor-backed configurable limit.',
    files: {
      'src/Limiter.ts': [
        'export class Limiter {',
        '  public constructor(private readonly maxItems = 8) {}',
        '',
        '  public apply(items: string[]): string[] {',
        '    return items.slice(0, 8);',
        '  }',
        '}',
        '',
      ].join('\n'),
    },
    expected: {
      'src/Limiter.ts': [
        'export class Limiter {',
        '  public constructor(private readonly maxItems = 8) {}',
        '',
        '  public apply(items: string[]): string[] {',
        '    return items.slice(0, this.maxItems);',
        '  }',
        '}',
        '',
      ].join('\n'),
    },
    edits: [{
      path: 'src/Limiter.ts',
      instruction: 'Use the existing maxItems constructor field instead of the hardcoded slice limit 8. Change nothing else.',
    }],
  },
  {
    id: 'insert-and-use',
    description: 'Insert one constructor field and use it in another region of the same file.',
    files: {
      'src/Planner.ts': [
        "export interface Step { id: string; goal: string }",
        '',
        'export class Planner {',
        '  public constructor(private readonly name: string) {}',
        '',
        '  public plan(steps: Step[]): Step[] {',
        '    const prepared = steps.map((step) => ({ ...step }));',
        '    return prepared.slice(0, 8);',
        '  }',
        '',
        '  public label(): string {',
        '    return this.name;',
        '  }',
        '}',
        '',
      ].join('\n'),
    },
    expected: {
      'src/Planner.ts': [
        "export interface Step { id: string; goal: string }",
        '',
        'export class Planner {',
        '  public constructor(',
        '    private readonly name: string,',
        '    private readonly maxPlanSteps = 8,',
        '  ) {}',
        '',
        '  public plan(steps: Step[]): Step[] {',
        '    const prepared = steps.map((step) => ({ ...step }));',
        '    return prepared.slice(0, this.maxPlanSteps);',
        '  }',
        '',
        '  public label(): string {',
        '    return this.name;',
        '  }',
        '}',
        '',
      ].join('\n'),
    },
    edits: [{
      path: 'src/Planner.ts',
      instruction: 'Add an optional maxPlanSteps constructor parameter defaulting to 8 and use it instead of the hardcoded slice limit. Preserve the name field and all unrelated code.',
    }],
  },
  {
    id: 'method-body',
    description: 'Change a small multi-line method body without touching surrounding helpers.',
    files: {
      'src/Validator.ts': [
        'export class Validator {',
        '  public validate(value: string): string {',
        "    if (!value) return 'missing';",
        "    return 'ok';",
        '  }',
        '',
        '  public normalize(value: string): string {',
        '    return value.trim();',
        '  }',
        '',
        '  public version(): number {',
        '    return 1;',
        '  }',
        '}',
        '',
      ].join('\n'),
    },
    expected: {
      'src/Validator.ts': [
        'export class Validator {',
        '  public validate(value: string): string {',
        '    const normalized = value.trim();',
        "    if (!normalized) return 'missing';",
        "    if (normalized.length > 20) return 'too-long';",
        "    return 'ok';",
        '  }',
        '',
        '  public normalize(value: string): string {',
        '    return value.trim();',
        '  }',
        '',
        '  public version(): number {',
        '    return 1;',
        '  }',
        '}',
        '',
      ].join('\n'),
    },
    edits: [{
      path: 'src/Validator.ts',
      instruction: "In validate(), trim the input first, treat empty trimmed input as 'missing', return 'too-long' when normalized length exceeds 20, otherwise return 'ok'. Do not modify normalize() or version().",
    }],
  },
  {
    id: 'two-files',
    description: 'Apply one coherent change across two small files.',
    files: {
      'src/Options.ts': [
        'export interface Options {',
        '  retries?: number;',
        '}',
        '',
      ].join('\n'),
      'src/Runner.ts': [
        "import type { Options } from './Options.js';",
        '',
        'export class Runner {',
        '  public constructor(private readonly options: Options) {}',
        '',
        '  public retries(): number {',
        '    return 3;',
        '  }',
        '}',
        '',
      ].join('\n'),
    },
    expected: {
      'src/Options.ts': [
        'export interface Options {',
        '  retries?: number;',
        '  maxItems?: number;',
        '}',
        '',
      ].join('\n'),
      'src/Runner.ts': [
        "import type { Options } from './Options.js';",
        '',
        'export class Runner {',
        '  public constructor(private readonly options: Options) {}',
        '',
        '  public retries(): number {',
        '    return 3;',
        '  }',
        '',
        '  public maxItems(): number {',
        '    return this.options.maxItems ?? 8;',
        '  }',
        '}',
        '',
      ].join('\n'),
    },
    edits: [
      { path: 'src/Options.ts', instruction: 'Add optional maxItems?: number to Options. Change nothing else.' },
      { path: 'src/Runner.ts', instruction: 'Add maxItems(): number that returns options.maxItems ?? 8. Preserve retries() and all existing behavior.' },
    ],
  },
  {
    id: 'large-file-small-edit',
    description: 'Make one tiny change in a larger file to expose full-file generation cost.',
    files: { 'src/LargeService.ts': largeFile(false) },
    expected: { 'src/LargeService.ts': largeFile(true) },
    edits: [{
      path: 'src/LargeService.ts',
      instruction: 'Change only getLimit() so it returns 16 instead of 8. Preserve every other line exactly.',
    }],
  },
];

class BenchmarkAdapter implements ModelAdapter {
  public readonly forwarded: ForwardedCallMetric[] = [];

  public constructor(
    private readonly delegate: ModelAdapter,
    private readonly edits: BenchmarkEdit[],
  ) {}

  public async complete(request: ModelRequest): Promise<RawModelResponse> {
    const user = [...request.messages].reverse().find((message) => message.role === 'user')?.content ?? '';
    if (user.startsWith('Attempt to complete the assigned PlanStep now.')) {
      return {
        content: JSON.stringify({
          outcome: 'ready',
          summary: 'Benchmark edit prepared.',
          edits: this.edits,
        }),
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        finishReason: 'benchmark-injected-decision',
      };
    }

    const startedAt = performance.now();
    const response = await this.delegate.complete(request);
    this.forwarded.push({
      durationMs: performance.now() - startedAt,
      request: user,
      response: response.content,
      promptTokens: response.usage?.prompt_tokens,
      completionTokens: response.usage?.completion_tokens,
      totalTokens: response.usage?.total_tokens,
      finishReason: response.finishReason,
    });
    return response;
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const configuration = await ConfigurationLoader.load(args.configPath);
  const timestamp = safeTimestamp(new Date());
  const runDir = resolve('benchmark/model-capabilities/runs', timestamp);
  await mkdir(runDir, { recursive: true });
  const benchmarkLogPath = join(runDir, 'benchmark.log');
  const editsLogPath = join(runDir, 'edits.log');
  await writeFile(benchmarkLogPath, '', 'utf8');
  await writeFile(editsLogPath, '', 'utf8');

  const strategies = args.strategies.length > 0
    ? args.strategies
    : (['replace', 'range-replace', 'diff', 'edit'] as StrategyId[]);

  const results: CaseResult[] = [];
  console.log(`[Benchmark] model capabilities · ${timestamp}`);
  console.log(`[Benchmark] model: ${configuration.model.model}`);
  console.log(`[Benchmark] strategies: ${strategies.join(', ')} · repeat: ${args.repeat}`);

  for (let repeat = 1; repeat <= args.repeat; repeat += 1) {
    for (const strategy of strategies) {
      for (const benchmarkCase of CASES) {
        const result = await runCase(configuration, strategy, benchmarkCase, timestamp, repeat, benchmarkLogPath, editsLogPath);
        results.push(result);
        const mark = result.correct && result.status === 'completed' ? '✓' : '✗';
        console.log(
          `${mark} ${strategy.padEnd(13)} ${benchmarkCase.id.padEnd(22)} ` +
          `${formatMs(result.durationMs)} · calls=${result.modelCalls} · tok=${result.totalTokens} · ${result.status}`,
        );
      }
    }
  }

  const summaryPath = join(runDir, 'summary.json');
  await writeFile(summaryPath, JSON.stringify({
    timestamp,
    model: configuration.model.model,
    configPath: args.configPath,
    repeat: args.repeat,
    strategies,
    results,
    artifacts: { benchmarkLog: benchmarkLogPath, editsLog: editsLogPath, summary: summaryPath },
    aggregate: aggregate(results),
  }, null, 2), 'utf8');

  console.log(`\n[Benchmark] run: ${runDir}`);
  console.log(`[Benchmark] summary: ${summaryPath}`);
  for (const item of aggregate(results)) {
    console.log(
      `[Benchmark] ${item.strategy}: ${item.correct}/${item.total} correct · ` +
      `median=${formatMs(item.medianDurationMs)} · avgTokens=${Math.round(item.averageTokens)}`,
    );
  }
}

async function runCase(
  configuration: Awaited<ReturnType<typeof ConfigurationLoader.load>>,
  strategy: StrategyId,
  benchmarkCase: BenchmarkCase,
  timestamp: string,
  repeat: number,
  benchmarkLogPath: string,
  editsLogPath: string,
): Promise<CaseResult> {
  const logger = new FileLogger(benchmarkLogPath);
  const project = new InMemoryBenchmarkProject(`model-capability-${benchmarkCase.id}`, benchmarkCase.files, logger);

  try {

    const delegate = new OpenAICompatibleModelAdapter(
      configuration.model.endpoint,
      configuration.model.apiKey,
      configuration.model.requestTimeoutMs,
    );
    const adapter = new BenchmarkAdapter(delegate, benchmarkCase.edits);
    const model = new ModelRunner(adapter, configuration.model);
    const action = createAction(strategy, project, model, logger);
    const worker = new CodeWorker(action, unavailableResearch(), logger, 1, 0);
    const task = new Task(`Benchmark: ${benchmarkCase.description}`, project.id);
    const step: PlanStep = {
      id: 'step-1',
      goal: benchmarkCase.description,
      constraints: ['Apply exactly the supplied benchmark edit.', 'Do not change unrelated content.'],
      decompositionType: 'coherent-outcome',
    };

    logger.info('benchmark.case.start', { strategy, caseId: benchmarkCase.id, repeat, edits: benchmarkCase.edits });
    const startedAt = performance.now();
    let run: WorkerResult;
    try {
      run = await worker.run(task, step);
    } catch (error) {
      run = { status: 'failed', reason: error instanceof Error ? error.message : String(error), canContinue: false };
    }
    const durationMs = performance.now() - startedAt;

    let correct = true;
    for (const [path, expected] of Object.entries(benchmarkCase.expected)) {
      const actual = project.content(path);
      if (actual !== expected) correct = false;
    }

    const expectedPaths = new Set(Object.keys(benchmarkCase.expected));
    let unchangedOutsideExpected = true;
    for (const [path, original] of Object.entries(benchmarkCase.files)) {
      if (expectedPaths.has(path)) continue;
      const actual = project.content(path);
      if (actual !== original) unchangedOutsideExpected = false;
    }

    const metrics = adapter.forwarded;
    const result: CaseResult = {
      timestamp: new Date().toISOString(),
      strategy,
      caseId: benchmarkCase.id,
      status: run.status,
      correct,
      unchangedOutsideExpected,
      durationMs,
      modelCalls: metrics.length,
      promptTokens: sum(metrics.map((item) => item.promptTokens)),
      completionTokens: sum(metrics.map((item) => item.completionTokens)),
      totalTokens: sum(metrics.map((item) => item.totalTokens)),
      ...(run.status === 'completed' ? {} : { reason: run.reason }),
      logPath: benchmarkLogPath,
    };
    logger.info('benchmark.case.finish', result);
    await appendEditDiagnostics(editsLogPath, strategy, benchmarkCase, repeat, adapter.forwarded, project, result);
    return result;
  } finally {
    // Project state exists only in memory; only the three run artifacts are persisted.
  }
}


async function appendEditDiagnostics(
  editsLogPath: string,
  strategy: StrategyId,
  benchmarkCase: BenchmarkCase,
  repeat: number,
  calls: ForwardedCallMetric[],
  project: InMemoryBenchmarkProject,
  result: CaseResult,
): Promise<void> {
  const sections: string[] = [];
  sections.push(`=== ${strategy} / ${benchmarkCase.id}${repeat > 1 ? ` / repeat ${repeat}` : ''} ===`);
  sections.push(`status: ${result.status}`);
  sections.push(`correct: ${result.correct}`);
  if (result.reason) sections.push(`reason: ${result.reason}`);

  calls.forEach((call, index) => {
    sections.push('', `MODEL PROPOSAL ${index + 1}`, call.response);
  });

  sections.push('', 'APPLY / RESULT');
  for (const [path, original] of Object.entries(benchmarkCase.files)) {
    const actual = project.content(path);
    const expected = benchmarkCase.expected[path] ?? original;
    sections.push(`file: ${path}`);
    if (actual === undefined) {
      sections.push('actual: <missing>');
      continue;
    }
    sections.push(`changed: ${actual !== original}`);
    sections.push(`matches expected: ${actual === expected}`);
    if (actual !== original) {
      sections.push('SOURCE -> ACTUAL');
      sections.push(compactLineDiff(original, actual));
    }
    if (actual !== expected) {
      sections.push('EXPECTED -> ACTUAL');
      sections.push(compactLineDiff(expected, actual));
    }
  }

  sections.push('', 'METRICS');
  sections.push(`durationMs: ${Math.round(result.durationMs)}`);
  sections.push(`modelCalls: ${result.modelCalls}`);
  sections.push(`tokens: prompt=${result.promptTokens} completion=${result.completionTokens} total=${result.totalTokens}`);
  sections.push('', '');
  await appendFile(editsLogPath, sections.join('\n'), 'utf8');
}

function compactLineDiff(before: string, after: string): string {
  const left = before.split('\n');
  const right = after.split('\n');
  let prefix = 0;
  while (prefix < left.length && prefix < right.length && left[prefix] === right[prefix]) prefix += 1;

  let leftSuffix = left.length - 1;
  let rightSuffix = right.length - 1;
  while (leftSuffix >= prefix && rightSuffix >= prefix && left[leftSuffix] === right[rightSuffix]) {
    leftSuffix -= 1;
    rightSuffix -= 1;
  }

  if (prefix === left.length && prefix === right.length) return '(no difference)';
  const contextStart = Math.max(0, prefix - 2);
  const contextEndLeft = Math.min(left.length - 1, leftSuffix + 2);
  const contextEndRight = Math.min(right.length - 1, rightSuffix + 2);
  const output: string[] = [`@@ near line ${prefix + 1} @@`];

  for (let index = contextStart; index < prefix; index += 1) output.push(`  ${left[index]}`);
  for (let index = prefix; index <= leftSuffix; index += 1) output.push(`- ${left[index]}`);
  for (let index = prefix; index <= rightSuffix; index += 1) output.push(`+ ${right[index]}`);

  const sharedTail = Math.min(contextEndLeft - leftSuffix, contextEndRight - rightSuffix);
  for (let offset = 1; offset <= sharedTail; offset += 1) output.push(`  ${left[leftSuffix + offset]}`);
  return output.join('\n');
}

function createAction(
  strategy: StrategyId,
  project: Project,
  model: ModelRunner,
  logger: EngineLogger,
): WorkerAction<any, any, any> {
  if (strategy === 'replace') return new ChangeCodeReplaceAction(project, model, logger, PROFILE, undefined, 6, 1);
  if (strategy === 'range-replace') return new ChangeCodeRangeReplaceAction(project, model, logger, PROFILE);
  if (strategy === 'diff') return new ChangeCodeDiffAction(project, model, logger, PROFILE, undefined, 6, 1);
  return new ChangeCodeEditAction(project, model, logger, PROFILE);
}

function unavailableResearch(): WorkerAction<any, any, any> {
  return {
    id: 'research',
    description: 'Research is disabled in model capability benchmarks because all edit intent is injected.',
    async run() {
      return { status: 'failed', reason: 'Research is disabled in this benchmark.', canContinue: false };
    },
  };
}

function parseArgs(argv: string[]): { configPath: string; strategies: StrategyId[]; repeat: number } {
  let configPath = 'nodus.config.json';
  let repeat = 1;
  let strategies: StrategyId[] = [];
  const positional: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--strategies') {
      const raw = argv[index + 1] ?? '';
      index += 1;
      strategies = raw.split(',').map((item) => item.trim()).filter(isStrategyId);
      continue;
    }
    if (value === '--repeat') {
      repeat = Math.max(1, Number.parseInt(argv[index + 1] ?? '1', 10) || 1);
      index += 1;
      continue;
    }
    positional.push(value);
  }

  if (positional[0]) configPath = positional[0];
  return { configPath, strategies, repeat };
}

function isStrategyId(value: string): value is StrategyId {
  return value === 'replace' || value === 'range-replace' || value === 'diff' || value === 'edit';
}

function aggregate(results: CaseResult[]): Array<{
  strategy: StrategyId;
  total: number;
  completed: number;
  correct: number;
  medianDurationMs: number;
  averageTokens: number;
}> {
  const strategies = Array.from(new Set(results.map((item) => item.strategy)));
  return strategies.map((strategy) => {
    const values = results.filter((item) => item.strategy === strategy);
    const durations = values.map((item) => item.durationMs).sort((a, b) => a - b);
    const middle = Math.floor(durations.length / 2);
    const medianDurationMs = durations.length === 0
      ? 0
      : durations.length % 2 === 0
        ? (durations[middle - 1] + durations[middle]) / 2
        : durations[middle];
    return {
      strategy,
      total: values.length,
      completed: values.filter((item) => item.status === 'completed').length,
      correct: values.filter((item) => item.correct && item.status === 'completed').length,
      medianDurationMs,
      averageTokens: values.length ? values.reduce((sumValue, item) => sumValue + item.totalTokens, 0) / values.length : 0,
    };
  });
}

function sum(values: Array<number | undefined>): number {
  return values.reduce<number>((total, value) => total + (value ?? 0), 0);
}

function safeTimestamp(date: Date): string {
  return date.toISOString().replace(/:/g, '-').replace(/\.\d{3}Z$/, (value) => value);
}

function formatMs(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${Math.round(value)}ms`;
}

function largeFile(changed: boolean): string {
  const lines = [
    'export class LargeService {',
    `  public getLimit(): number { return ${changed ? 16 : 8}; }`,
    '',
  ];
  for (let index = 1; index <= 180; index += 1) {
    lines.push(`  public helper${index}(value: number): number { return value + ${index}; }`);
  }
  lines.push('}', '');
  return lines.join('\n');
}

await main();
