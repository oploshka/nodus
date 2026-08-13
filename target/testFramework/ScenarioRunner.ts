import { Bootstrap } from 'src/app/Bootstrap.js';
import type { AppConfiguration } from 'src/app/Config/Configuration.js';
import type { TaskRun } from 'src/engine/Task/TaskRun.js';
import type { ModelAdapter } from 'src/model/Adapter/ModelAdapter.js';
import type { ScenarioDefinition } from 'target/testFramework/Scenario.js';
import { LoggedModelAdapter, QueueModelAdapter } from 'target/testFramework/ModelHarness.js';
import { TestFileLogger } from 'target/testFramework/TestLogger.js';
import { TestProject } from 'target/testFramework/TestProject.js';

export interface ScenarioRun {
  scenario: ScenarioDefinition;
  project: TestProject;
  engine: import('src/engine/Engine.js').Engine;
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
