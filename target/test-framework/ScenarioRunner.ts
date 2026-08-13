import { Bootstrap } from '@app/Bootstrap.js';
import type { AppConfiguration } from '@app/Config/Configuration.js';
import type { TaskRun } from '@engine/Task/TaskRun.js';
import type { ModelAdapter } from '@model/Adapter/ModelAdapter.js';
import type { ScenarioDefinition } from '@test-framework/Scenario.js';
import { LoggedModelAdapter, QueueModelAdapter } from '@test-framework/ModelHarness.js';
import { TestFileLogger } from '@test-framework/TestLogger.js';
import { TestProject } from '@test-framework/TestProject.js';

export interface ScenarioRun {
  scenario: ScenarioDefinition;
  project: TestProject;
  engine: import('@engine/Engine.js').Engine;
  run: TaskRun;
  model: ModelAdapter;
  logger: TestFileLogger;
  dispose(): Promise<void>;
}

export interface ScenarioRunOptions {
  model?: ModelAdapter;
  logger?: TestFileLogger;
}

export async function runScenario(
  definition: ScenarioDefinition,
  options: ScenarioRunOptions = {},
): Promise<ScenarioRun> {
  const project = await TestProject.create(definition.id, definition.files);
  const logger = options.logger ?? new TestFileLogger(definition.id);
  const model = options.model
    ? new LoggedModelAdapter(options.model, logger)
    : new QueueModelAdapter([...definition.modelResponses], logger);

  const configuration: AppConfiguration = {
    project: {
      id: `test-${definition.id}`,
      root: project.root,
      scanMode: 'on-open',
      exclude: ['.nodus'],
    },
    model: {
      provider: 'openai-compatible',
      endpoint: 'http://unused',
      model: 'test-model',
      maxTokens: 4096,
      ...definition.model,
    },
    runtime: definition.runtime,
  };

  logger.info('test.scenario.start', { id: definition.id, task: definition.task, root: project.root });
  try {
    const engine = await Bootstrap.createEngine(configuration, { logger, model });
    const run = await engine.run(definition.task);
    logger.info('test.scenario.finish', { id: definition.id, status: run.status });
    return {
      scenario: definition,
      project,
      engine,
      run,
      model,
      logger,
      dispose: () => project.dispose(),
    };
  } catch (error) {
    logger.error('test.scenario.error', { id: definition.id, error: error instanceof Error ? error.message : String(error) });
    await project.dispose();
    throw error;
  }
}
