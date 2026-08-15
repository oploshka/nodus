import type { AppConfiguration } from '@app/Config/Configuration.js';
import { ConsoleLogger } from '@app/Logging/Logger.js';
import { ModelDetermine } from '@engine/Determine/ModelDetermine.js';
import { Engine } from '@engine/Engine.js';
import { ModelPlanner } from '@engine/Planner/ModelPlanner.js';
import { Project } from '@engine/Project/Project.js';
import { BoundedModelResearchResolver } from '@engine/Research/BoundedModelResearchResolver.js';
import { Research } from '@engine/Research/Research.js';
import { ResearchStore } from '@engine/Research/ResearchStore.js';
import type { EngineLogger } from '@engine/Type/EngineLogger.js';
import { ChangeCodeAction } from '@engine/Worker/Action/ChangeCodeAction.js';
import { ProjectEditor } from '@engine/Edit/ProjectEditor.js';
import { RangeReplaceEditStrategy } from '@engine/Edit/Strategy/RangeReplaceEditStrategy.js';
import { ReplaceEditStrategy } from '@engine/Edit/Strategy/ReplaceEditStrategy.js';
import { DiffEditStrategy } from '@engine/Edit/Strategy/DiffEditStrategy.js';
import { FullFileEditStrategy } from '@engine/Edit/Strategy/FullFileEditStrategy.js';
import { EditValidator } from '@engine/Edit/Validation/EditValidator.js';
import { JsonEditValidationCheck } from '@engine/Edit/Validation/JsonEditValidationCheck.js';
import type { EngineTest } from '@engine/EngineTest/EngineTest.js';
import { ResolveEngineTest } from '@engine/EngineTest/ResolveEngineTest.js';
import { CompositeEngineTest } from '@engine/EngineTest/CompositeEngineTest.js';
import { UnitEngineTest } from '@engine/EngineTest/UnitEngineTest.js';
import { TypecheckEngineTest } from '@engine/EngineTest/TypecheckEngineTest.js';
import type { CommandEngineTest } from '@engine/EngineTest/CommandEngineTest.js';
import { ResearchAction } from '@engine/Worker/Action/ResearchAction.js';
import { CodeWorker } from '@engine/Worker/CodeWorker.js';
import { DocumentationWorker } from '@engine/Worker/DocumentationWorker.js';
import { AgentWorker } from '@engine/Worker/AgentWorker.js';
import type { ModelAdapter } from '@model/Adapter/ModelAdapter.js';
import { isAgentModelAdapter } from '@model/Adapter/AgentModelAdapter.js';
import { OpenAICompatibleModelAdapter } from '@model/Adapter/OpenAICompatibleModelAdapter.js';
import { AgentRunner } from '@model/Runner/AgentRunner.js';
import { ModelRunner } from '@model/Runner/ModelRunner.js';
import { FileSystemTool } from '@model/Tool/FileSystem/FileSystemTool.js';
import { GitTool } from '@model/Tool/Git/GitTool.js';
import { SearchTool } from '@model/Tool/Search/SearchTool.js';
import { TerminalTool } from '@model/Tool/Terminal/TerminalTool.js';
import type { Worker } from '@engine/Worker/Worker.js';
import type { LanguageConfiguration } from '@engine/Type/LanguageConfiguration.js';
import type { NodusSettings } from '../settings/NodusSettings.js';
import { defaultNodusSettings } from '../settings/defaultSettings.js';

export interface BootstrapOverrides {
  logger?: EngineLogger;
  model?: ModelAdapter;
  project?: Project;
  engineTest?: EngineTest;
  settings?: NodusSettings;
}

/** Composition root for Engine dependencies. */
export class Bootstrap {
  public static async createEngine(
    configuration: AppConfiguration,
    overrides: BootstrapOverrides = {},
  ): Promise<Engine> {
    const settings = overrides.settings ?? defaultNodusSettings;
    const workerAdaptation = settings.process.worker;
    const language = resolveLanguageConfiguration(configuration);
    const logger = overrides.logger ?? new ConsoleLogger(language.response);
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
      new BoundedModelResearchResolver(project, model, logger, language.nodus),
      project,
      logger,
    );

    const researchAction = new ResearchAction(research, workerAdaptation.research.guidance);

    const codeWorker = new CodeWorker(
      new ChangeCodeAction(project, model, logger, {
        ...workerAdaptation.profiles.code,
        adaptationGuidance: workerAdaptation.change.guidance,
        language,
      }),
      researchAction,
      logger,
      configuration.runtime?.maxWorkerAttempts,
      configuration.runtime?.maxResearchRequests,
    );

    const documentationWorker = new DocumentationWorker(
      new ChangeCodeAction(project, model, logger, {
        ...workerAdaptation.profiles.documentation,
        adaptationGuidance: workerAdaptation.change.guidance,
        language,
      }),
      researchAction,
      logger,
      configuration.runtime?.maxWorkerAttempts,
      configuration.runtime?.maxResearchRequests,
    );

    const workers: Worker[] = [codeWorker, documentationWorker];
    if (isAgentModelAdapter(adapter)) {
      const tools = [new FileSystemTool(), new SearchTool(), new TerminalTool(), new GitTool()];
      workers.push(new AgentWorker(
        new AgentRunner(adapter, configuration.model),
        tools,
        { projectRoot: project.root, exclude: project.configuration.exclude ?? [] },
        logger,
        configuration.runtime?.maxAgentRounds,
        language,
      ));
    }

    const editValidator = new EditValidator([
      new JsonEditValidationCheck(),
    ]);
    const createEdit = () => new ProjectEditor(project, logger, [
      new RangeReplaceEditStrategy(project, model, logger, language, 'Prefer existing project APIs and conventions. Keep source edits minimal.'),
      new ReplaceEditStrategy(project, model, logger, language, 'Prefer existing project APIs and conventions. Keep source edits minimal.'),
      new DiffEditStrategy(model, logger, language, 'Prefer existing project APIs and conventions. Keep source edits minimal.'),
      new FullFileEditStrategy(project, model, logger, language, 'Prefer existing project APIs and conventions. Keep source edits minimal.'),
    ], editValidator);

    return new Engine(
      project,
      new ModelPlanner(model, logger, language.nodus, settings.process.planner.template),
      workers,
      new ModelDetermine(model, logger, language.nodus),
      createEdit,
      overrides.engineTest ?? createEngineTest(configuration, project),
      logger,
    );
  }
}

function createEngineTest(configuration: AppConfiguration, project: Project): EngineTest {
  const tests: CommandEngineTest[] = [];
  if (configuration.engineTest?.typecheck) tests.push(new TypecheckEngineTest(project.root, configuration.engineTest.typecheck));
  if (configuration.engineTest?.unit) tests.push(new UnitEngineTest(project.root, configuration.engineTest.unit));
  return tests.length === 0 ? new ResolveEngineTest() : new CompositeEngineTest(tests);
}

function resolveLanguageConfiguration(configuration: AppConfiguration): LanguageConfiguration {
  return {
    project: configuration.language?.project ?? 'en',
    nodus: configuration.language?.nodus ?? 'en',
    response: configuration.language?.response ?? 'en',
  };
}
