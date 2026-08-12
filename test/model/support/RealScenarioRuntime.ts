import { ToolExecutor } from '@model/Tool/Execution/ToolExecutor';
import { RecoveryController } from '@planner/RecoveryController';
import { StepRegistry } from '@planner/StepRegistry';
import { ExecutionReporter } from '@agent/Reporting/ExecutionReporter';
import { ContextSelector } from '@context/Selector/ContextSelector';
import { ConfigurationLoader } from '@core/Configuration/ConfigurationLoader';
import { Logger } from '@core/Logging/Logger';
import { PayloadLogger } from '@core/Logging/PayloadLogger';
import { ResearchResolver } from '@research/Resolver/ResearchResolver';
import { ResearchStore } from '@research/Store/ResearchStore';
import { OpenAICompatibleModelAdapter } from '@model/Adapter/OpenAICompatibleModelAdapter';
import { ModelController, type ModelExecutionInput } from '@model/Controller/ModelController';
import { DEFAULT_OPERATION_PROFILES } from '@operation/Default/DefaultOperationProfile';
import { OperationRegistry } from '@operation/Registry/OperationRegistry';
import { ProjectSession } from '@project/ProjectSession/ProjectSession';
import { ProjectScanner } from '@project/Scanner/ProjectScanner';
import { FileSystemTool } from '@model/Tool/FileSystem/FileSystemTool';
import { GitTool } from '@model/Tool/Git/GitTool';
import { ToolRegistry } from '@model/Tool/Registry/ToolRegistry';
import { SearchTool } from '@model/Tool/Search/SearchTool';
import { TerminalTool } from '@model/Tool/Terminal/TerminalTool';

export interface RealScenarioRuntime {
  projectSession: ProjectSession;
  operationRegistry: OperationRegistry;
  modelController: Pick<ModelController, 'execute'>;
  toolExecutor: ToolExecutor;
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
  const researchStore = new ResearchStore();
  const projectSession = new ProjectSession(configuration.project, researchStore, new ProjectScanner(), logger);
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
    new ContextSelector(new ResearchResolver(researchStore)),
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
    recoveryController: new RecoveryController(configuration.model, adapter, new StepRegistry(), logger),
    modelInputs,
  };
}
