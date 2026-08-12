import type { AppConfiguration } from '@app/Config/Configuration.js';
import { ConsoleLogger } from '@app/Logging/Logger.js';
import { Engine } from '@engine/Engine.js';
import { ModelPlanner } from '@engine/Planner/ModelPlanner.js';
import { Project } from '@engine/Project/Project.js';
import { BoundedModelResearchResolver } from '@engine/Research/BoundedModelResearchResolver.js';
import { Research } from '@engine/Research/Research.js';
import { ResearchStore } from '@engine/Research/ResearchStore.js';
import type { EngineLogger } from '@engine/Type/EngineLogger.js';
import { DefaultWorker } from '@engine/Worker/DefaultWorker.js';
import { EditFileAction } from '@engine/Worker/Action/EditFileAction.js';
import { ResearchAction } from '@engine/Worker/Action/ResearchAction.js';
import { ModelExecutionPlanner } from '@engine/Worker/ModelExecutionPlanner.js';
import { FirstMatchWorkerSelector } from '@engine/Worker/WorkerSelector.js';
import type { ModelAdapter } from '@model/Adapter/ModelAdapter.js';
import { OpenAICompatibleModelAdapter } from '@model/Adapter/OpenAICompatibleModelAdapter.js';
import { ModelRunner } from '@model/Runner/ModelRunner.js';

export interface BootstrapOverrides {
  logger?: EngineLogger;
  model?: ModelAdapter;
  project?: Project;
}

/** Composition root for Engine dependencies. */
export class Bootstrap {
  public static async createEngine(
    configuration: AppConfiguration,
    overrides: BootstrapOverrides = {},
  ): Promise<Engine> {
    const logger = overrides.logger ?? new ConsoleLogger();
    const adapter = overrides.model ?? new OpenAICompatibleModelAdapter(
      configuration.model.endpoint,
      configuration.model.apiKey,
      configuration.model.requestTimeoutMs,
    );
    const model = new ModelRunner(adapter, configuration.model);

    const project = overrides.project ?? new Project(configuration.project, logger);
    if (!overrides.project) await project.open();

    const researchStore = new ResearchStore(project, logger, project.configuration.researchCachePath);
    await researchStore.open();
    const research = new Research(
      researchStore,
      new BoundedModelResearchResolver(project, model, logger),
      project,
      logger,
    );

    const planner = new ModelPlanner(model, logger);
    const executionPlanner = new ModelExecutionPlanner(model, logger);
    const worker = new DefaultWorker(
      executionPlanner,
      [
        new ResearchAction(research, configuration.runtime?.maxResearchActions),
        new EditFileAction(project, model, logger, configuration.runtime?.maxEditActions),
      ],
      logger,
      configuration.runtime?.maxWorkerIterations,
    );

    return new Engine(project, planner, [worker], new FirstMatchWorkerSelector(), logger);
  }
}
