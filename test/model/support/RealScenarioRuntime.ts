import { ChangeExecutor } from '@agent/Execution/ChangeExecutor';
import { ToolExecutor } from '@agent/Execution/ToolExecutor';
import { RecoveryController } from '@agent/Planning/RecoveryController';
import { StepRegistry } from '@agent/Planning/StepRegistry';
import { ExecutionReporter } from '@agent/Reporting/ExecutionReporter';
import { ContextSelector } from '@context/Selector/ContextSelector';
import { ConfigurationLoader } from '@core/Configuration/ConfigurationLoader';
import { Logger } from '@core/Logging/Logger';
import { PayloadLogger } from '@core/Logging/PayloadLogger';
import { KnowledgeResolver } from '@knowledge/Resolver/KnowledgeResolver';
import { KnowledgeStore } from '@knowledge/Store/KnowledgeStore';
import { OpenAICompatibleModelAdapter } from '@model/Adapter/OpenAICompatibleModelAdapter';
import { ModelController, type ModelExecutionInput } from '@model/Controller/ModelController';
import { DEFAULT_OPERATION_PROFILES } from '@operation/Default/DefaultOperationProfile';
import { OperationRegistry } from '@operation/Registry/OperationRegistry';
import { ProjectSession } from '@project/ProjectSession/ProjectSession';
import { ProjectScanner } from '@project/Scanner/ProjectScanner';
import { FileSystemTool } from '@tool/FileSystem/FileSystemTool';
import { GitTool } from '@tool/Git/GitTool';
import { ToolRegistry } from '@tool/Registry/ToolRegistry';
import { SearchTool } from '@tool/Search/SearchTool';
import { TerminalTool } from '@tool/Terminal/TerminalTool';

export interface RealScenarioRuntime {
  projectSession: ProjectSession;
  operationRegistry: OperationRegistry;
  modelController: Pick<ModelController, 'execute'>;
  toolExecutor: ToolExecutor;
  changeExecutor: ChangeExecutor;
  recoveryController: RecoveryController;
  modelInputs: ModelExecutionInput[];
}

export async function createRealScenarioRuntime(): Promise<RealScenarioRuntime> {
  const configPath = process.env.NODUS_TEST_CONFIG ?? 'nodus.config.json';
  const loaded = await ConfigurationLoader.load(configPath);
  if (loaded.model.provider !== 'openai-compatible' || !loaded.model.endpoint) {
    throw new Error('Model scenario tests require openai-compatible model.endpoint');
  }

  const endpoint = loaded.model.endpoint;
  const configuration = {
    ...loaded,
    project: { ...loaded.project, scanMode: 'manual' as const, cachePath: undefined, clearCacheOnStart: false },
    logging: { ...loaded.logging, console: false, file: false, modelPayload: false, consoleMode: 'quiet' as const },
  };

  const logger = new Logger('error', []);
  const knowledgeStore = new KnowledgeStore();
  const projectSession = new ProjectSession(configuration.project, knowledgeStore, new ProjectScanner(), logger);
  await projectSession.open();
  await projectSession.scan();

  const operationRegistry = new OperationRegistry();
  for (const profile of DEFAULT_OPERATION_PROFILES) operationRegistry.register(profile);

  const toolRegistry = new ToolRegistry();
  toolRegistry.register(new FileSystemTool());
  toolRegistry.register(new TerminalTool());
  toolRegistry.register(new GitTool());
  toolRegistry.register(new SearchTool());

  const adapter = new OpenAICompatibleModelAdapter(endpoint, configuration.model.apiKey, configuration.model.requestTimeoutMs);
  const reporter = new ExecutionReporter('quiet', false);
  const baseModelController = new ModelController(
    configuration.model,
    configuration.agent,
    configuration.logging,
    adapter,
    new ContextSelector(new KnowledgeResolver(knowledgeStore)),
    projectSession,
    operationRegistry,
    toolRegistry,
    logger,
    new PayloadLogger(configuration.project.root, '.nodus/test-payload-unused'),
    reporter,
  );

  const modelInputs: ModelExecutionInput[] = [];
  const modelController: Pick<ModelController, 'execute'> = {
    execute: async (input: ModelExecutionInput) => {
      modelInputs.push(input);
      return baseModelController.execute(input);
    },
  };

  return {
    projectSession,
    operationRegistry,
    modelController,
    toolExecutor: new ToolExecutor(toolRegistry, projectSession, logger),
    changeExecutor: new ChangeExecutor(toolRegistry, projectSession, logger),
    recoveryController: new RecoveryController(configuration.model, adapter, new StepRegistry(), logger),
    modelInputs,
  };
}
