import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ConfigurationLoader } from '@app/Config/ConfigurationLoader.js';
import { defaultNodusSettings } from '../../src/settings/defaultSettings.js';
import { ModelLanguagePolicy } from '@engine/Language/ModelLanguagePolicy.js';
import { OpenAICompatibleModelAdapter } from '@model/Adapter/OpenAICompatibleModelAdapter.js';
import { ModelRunner } from '@model/Runner/ModelRunner.js';
import { ModelRequestFormat } from '@model/Request/ModelRequestFormat.js';
import { ModelResponseFormat } from '@model/Response/ModelResponseFormat.js';
import type { ModelResponseSchema } from '@model/Response/ModelResponseSchema.js';

const TASK = 'Добавь поддержку удаления задач. TodoStore должен уметь удалять задачу по id, а TodoService должен предоставить соответствующий публичный метод. При попытке удалить несуществующую задачу верни false. Добавь тесты существующего и несуществующего id. Не меняй остальное поведение проекта.';
const STEP = {
  goal: 'Implement task deletion in TodoStore by adding a method to remove a task by its id and return a boolean indicating success.',
  constraints: [],
  decompositionType: 'coherent-outcome',
};
const TARGET_PATH = 'src/TodoStore.ts';
const CANDIDATES = ['src/TodoStore.ts', 'src/TodoService.ts', 'test/TodoService.test.ts'];

interface ChangeDecision {
  outcome: 'ready' | 'missing-information' | 'already-completed' | 'failed';
  summary?: string;
  reason?: string;
  findFiles?: string[];
  readFiles?: string[];
  questions?: string[];
  edits?: Array<{ path: string; instruction: string }>;
}

const schema: ModelResponseSchema = {
  description: 'One bounded attempt to determine the semantic project changes needed for the assigned PlanStep.',
  fields: {
    outcome: { type: 'option', optionList: [
      { id: 'ready', description: 'Enough information is available; return semantic edit intents.' },
      { id: 'missing-information', description: 'Specific project facts are required before editing safely.' },
      { id: 'already-completed', description: 'The requested outcome is already true; no edit is needed.' },
      { id: 'failed', description: 'The task cannot be performed under the supplied constraints.' },
    ] },
    summary: { type: 'string', optional: true },
    reason: { type: 'string', optional: true },
    findFiles: { type: 'array', items: { type: 'string' }, optional: true, description: 'File names or concepts whose project paths are not yet known. FindFile returns paths only.' },
    readFiles: { type: 'array', items: { type: 'string' }, optional: true, description: 'Already known project paths whose contents are required.' },
    questions: { type: 'array', items: { type: 'string' }, optional: true },
    edits: { type: 'array', optional: true, items: { type: 'object', fields: { path: { type: 'string' }, instruction: { type: 'string' } } } },
  },
};

function renderTemplate(template: string, message: string): string {
  return template.replaceAll('##message##', message);
}

function baseGuidance(language: { project: string; nodus: string; response: string }): string[] {
  const adaptation = defaultNodusSettings.process.worker;
  return [
    adaptation.profiles.code.guidance,
    ...adaptation.change.guidance,
    ...new ModelLanguagePolicy(language).mixedProjectEdit(),
    'This Action only describes what must change. Do not generate diff, replacement blocks, line ranges, or complete file contents.',
    'Treat summary and reason as internal Nodus fields.',
    'When information is missing, request the cheapest sufficient operation: findFiles only when a required project path is unknown, readFiles when an already known file must be inspected, and questions only for cross-file analysis or project knowledge that cannot be answered by direct retrieval.',
    'Do not use questions to ask for a file path, exact signature, type fields, or file contents when FindFile/ReadFile can answer it.',
    'readFiles entries must come from candidateFiles, prior FindFile results, or prior context; do not invent paths.',
    'Request only the minimum information needed for the next decision. Do not fill an arbitrary request count.',
    'Every edit.path must be relative to the project root.',
    'Each edit.instruction must describe the required semantic result for exactly that file, without prescribing an edit serialization format.',
    'One coherent change may edit multiple files when required for the same outcome.',
    'Keep edits minimal and preserve unrelated behavior.',
    'Do not perform validation; validation is a separate concern.',
  ];
}

function withoutJsonExamples(template: string): string {
  return template
    .split('\n')
    .filter((line) => !line.startsWith('Wrong:') && !line.startsWith('Correct:'))
    .join('\n');
}

async function runVariant(
  name: string,
  model: ModelRunner,
  fileContent: string,
  language: { project: string; nodus: string; response: string },
  options: { template: string; guidance: string[]; secondContextLabel?: string },
): Promise<void> {
  const message = renderTemplate(
    options.template,
    'Determine the concrete project edits required to complete the assigned PlanStep now.',
  );

  console.log(`\n=== ${name} ===`);

  const first = await model.run<ChangeDecision>({
    request: {
      message,
      data: {
        task: TASK,
        step: STEP,
        purpose: defaultNodusSettings.process.worker.profiles.code.purpose,
        candidateFiles: CANDIDATES,
        context: [],
      },
      format: ModelRequestFormat.Json,
      guidance: options.guidance.join('\n'),
    },
    response: { format: ModelResponseFormat.Raw, schema },
    settings: { temperature: 0, maxTokens: 2048 },
  });

  console.log('[round 1 request]');
  for (const item of first.exchange.request) console.log(`${item.role}:\n${item.message}\n`);
  console.log('[round 1 response]');
  console.log(first.exchange.response[0]?.message ?? '<empty>');
  console.log('[round 1 data]', JSON.stringify(first.data));

  const contextKey = options.secondContextLabel ?? 'context';
  const data: Record<string, unknown> = {
    task: TASK,
    step: STEP,
    purpose: defaultNodusSettings.process.worker.profiles.code.purpose,
    candidateFiles: CANDIDATES,
  };
  data[contextKey] = [{ kind: 'read', path: TARGET_PATH, content: fileContent }];

  const second = await model.run<ChangeDecision>({
    request: {
      message,
      data,
      format: ModelRequestFormat.Json,
      guidance: options.guidance.join('\n'),
    },
    response: { format: ModelResponseFormat.Raw, schema },
    settings: { temperature: 0, maxTokens: 2048 },
  });

  console.log('[round 2 request]');
  for (const item of second.exchange.request) console.log(`${item.role}:\n${item.message}\n`);
  console.log('[round 2 response]');
  console.log(second.exchange.response[0]?.message ?? '<empty>');
  console.log('[round 2 data]', JSON.stringify(second.data));

  const repeated = second.data.readFiles?.includes(TARGET_PATH) ?? false;
  console.log(`[result] ${repeated ? 'REPEAT TodoStore read' : second.data.outcome}`);
}

async function main(): Promise<void> {
  const configPath = process.argv[2] ?? 'target/project/nodus.config.json';
  const configuration = await ConfigurationLoader.load(configPath);
  if (configuration.model.provider !== 'openai-compatible' || !configuration.model.endpoint) {
    throw new Error('Benchmark requires model.provider=openai-compatible and model.endpoint');
  }

  const adapter = new OpenAICompatibleModelAdapter(
    configuration.model.endpoint,
    configuration.model.apiKey,
    configuration.model.requestTimeoutMs,
  );
  const model = new ModelRunner(adapter, configuration.model);
  const language = {
    project: configuration.language?.project ?? 'en',
    nodus: configuration.language?.nodus ?? 'en',
    response: configuration.language?.response ?? 'en',
  };
  const fileContent = await readFile(resolve(configuration.target.root, TARGET_PATH), 'utf8');
  const adaptation = defaultNodusSettings.process.worker;
  const exactTemplate = adaptation.change.template;
  const exactGuidance = baseGuidance(language);

  console.log('ChangeCodeAction prompt probe');
  console.log(`Model: ${configuration.model.model}`);
  console.log(`Target: ${TARGET_PATH}`);
  console.log('Each round is a complete independent model request. No conversation/cache id is supplied.');

  await runVariant('exact-current', model, fileContent, language, {
    template: exactTemplate,
    guidance: exactGuidance,
  });

  await runVariant('without-json-examples', model, fileContent, language, {
    template: withoutJsonExamples(exactTemplate),
    guidance: exactGuidance,
  });

  await runVariant('reduced-guidance', model, fileContent, language, {
    template: withoutJsonExamples(exactTemplate),
    guidance: [
      adaptation.profiles.code.guidance,
      ...new ModelLanguagePolicy(language).mixedProjectEdit(),
      'Work only within the current PlanStep.',
      'Previously read file contents in context are already available evidence. Do not request the same path again.',
      'If enough information is available, return semantic edit intents. Otherwise request only the minimum missing file contents.',
      'Do not generate diffs, line ranges, replacement blocks, or complete file contents.',
    ],
  });

  await runVariant('action-results-label', model, fileContent, language, {
    template: withoutJsonExamples(exactTemplate),
    guidance: exactGuidance,
    secondContextLabel: 'actionResults',
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
