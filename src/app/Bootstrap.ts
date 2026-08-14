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
import { CommandValidationCheck } from '@engine/Validation/CommandValidationCheck.js';
import { CompositeValidator } from '@engine/Validation/CompositeValidator.js';
import { JsonValidationCheck } from '@engine/Validation/JsonValidationCheck.js';
import type { ValidationCheck } from '@engine/Validation/ValidationCheck.js';
import type { Validator } from '@engine/Validation/Validator.js';
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

export interface BootstrapOverrides {
  logger?: EngineLogger;
  model?: ModelAdapter;
  project?: Project;
  validator?: Validator;
}

/** Composition root for Engine dependencies. */
export class Bootstrap {
  public static async createEngine(
    configuration: AppConfiguration,
    overrides: BootstrapOverrides = {},
  ): Promise<Engine> {
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

    const researchAction = new ResearchAction(research);

    const codeWorker = new CodeWorker(
      new ChangeCodeAction(project, model, logger, {
        purpose: 'Implement the requested software/project behavior change.',
        guidance: 'Prefer existing project APIs and conventions. Change source code only when required by the task.',
        language,
        strategy: 'range-replace',
      }),
      researchAction,
      logger,
      configuration.runtime?.maxWorkerAttempts,
      configuration.runtime?.maxResearchRequests,
    );

    const documentationWorker = new DocumentationWorker(
      new ChangeCodeAction(project, model, logger, {
        purpose: 'Implement the requested human-facing documentation change.',
        guidance: 'Prefer documentation files and explanatory text. Do not modify runtime code unless the task explicitly requires it.',
        language,
        strategy: 'diff',
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

    const createEdit = () => new ProjectEditor(project, logger, [
      new RangeReplaceEditStrategy(project, model, logger, language, 'Prefer existing project APIs and conventions. Keep source edits minimal.'),
      new ReplaceEditStrategy(project, model, logger, language, 'Prefer existing project APIs and conventions. Keep source edits minimal.'),
      new DiffEditStrategy(model, logger, language, 'Prefer existing project APIs and conventions. Keep source edits minimal.'),
      new FullFileEditStrategy(project, model, logger, language, 'Prefer existing project APIs and conventions. Keep source edits minimal.'),
    ]);

    return new Engine(
      project,
      new ModelPlanner(model, logger, language.nodus),
      workers,
      new ModelDetermine(model, logger, language.nodus),
      createEdit,
      overrides.validator ?? createValidator(configuration, project),
      logger,
    );
  }
}

function createValidator(configuration: AppConfiguration, project: Project): Validator {
  const checks: ValidationCheck[] = [];
  if (configuration.validation?.json !== false) checks.push(new JsonValidationCheck(project));
  for (const command of configuration.validation?.commands ?? []) {
    checks.push(new CommandValidationCheck(project.root, command));
  }
  return new CompositeValidator(checks);
}

function resolveLanguageConfiguration(configuration: AppConfiguration): LanguageConfiguration {
  return {
    project: configuration.language?.project ?? 'en',
    nodus: configuration.language?.nodus ?? 'en',
    response: configuration.language?.response ?? 'en',
  };
}
