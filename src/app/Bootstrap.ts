import type { AppConfiguration } from './config/Configuration.js';
import { ConsoleLogger, type Logger } from './logging/Logger.js';
import { Engine } from '../engine/Engine.js';
import { ModelPlanner } from '../engine/planner/ModelPlanner.js';
import { Project } from '../engine/project/Project.js';
import { BoundedModelResearchResolver } from '../engine/research/BoundedModelResearchResolver.js';
import { Research } from '../engine/research/Research.js';
import { ResearchStore } from '../engine/research/ResearchStore.js';
import { DefaultWorker } from '../engine/worker/DefaultWorker.js';
import { ModelExecutionPlanner } from '../engine/worker/ModelExecutionPlanner.js';
import { EditFileAction } from '../engine/worker/action/EditFileAction.js';
import { ResearchAction } from '../engine/worker/action/ResearchAction.js';
import type { ModelAdapter } from '../model/Adapter/ModelAdapter.js';
import { OpenAICompatibleModelAdapter } from '../model/Adapter/OpenAICompatibleModelAdapter.js';
import { ModelRunner } from '../model/Runner/ModelRunner.js';

export interface ApplicationServices {
  engine: Engine;
  project: Project;
}

export class Bootstrap {
  public static async create(
    configuration: AppConfiguration,
    overrides: { logger?: Logger; model?: ModelAdapter } = {},
  ): Promise<ApplicationServices> {
    const logger = overrides.logger ?? new ConsoleLogger();
    const adapter = overrides.model ?? new OpenAICompatibleModelAdapter(
      configuration.model.endpoint,
      configuration.model.apiKey,
      configuration.model.requestTimeoutMs,
    );
    const model = new ModelRunner(adapter, configuration.model);

    const project = new Project(configuration.project, logger);
    await project.open();

    const researchStore = new ResearchStore(project, logger, configuration.project.researchCachePath);
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
        new ResearchAction(research, configuration.runtime?.maxResearchActions ?? 3),
        new EditFileAction(project, model, logger, configuration.runtime?.maxEditActions ?? 2),
      ],
      logger,
      configuration.runtime?.maxWorkerIterations ?? 8,
    );

    return {
      engine: new Engine(project, planner, worker, logger),
      project,
    };
  }
}
