// Nodus.ts
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { HumanInteraction } from '@agent/Human/HumanInteraction';
import { ChangeExecution } from '@execution/ChangeExecution';
import { ChangeOptionResolver } from '@execution/Option/ChangeOption';
import { ChangeCommitWorker } from '@execution/Worker/ChangeCommitWorker';
import { ChangePrepareWorker } from '@execution/Worker/ChangePrepareWorker';
import { ChangeValidationWorker } from '@execution/Worker/ChangeValidationWorker';
import { EditProposalWorker } from '@execution/Worker/EditProposalWorker';
import { PatchApplyWorker } from '@execution/Worker/PatchApplyWorker';
import { ToolExecutor } from '@model/Tool/Execution/ToolExecutor';
import { AgentRuntime } from '@agent/Runtime/AgentRuntime';
import { ExecutionReporter } from '@agent/Reporting/ExecutionReporter';
import { PlanGenerator } from '@planner/PlanGenerator';
import type { RequirementMap } from '@planner/RequirementMap';
import type { TaskPlan } from '@planner/TaskPlan';
import { PlanExecutor } from '@planner/PlanExecutor';
import { PlanUpdater } from '@planner/PlanUpdater';
import { RecoveryController } from '@planner/RecoveryController';
import { RequirementResolutionPlanner } from '@planner/RequirementResolutionPlanner';
import { StepRegistry } from '@planner/StepRegistry';
import type { NodusConfiguration } from '@core/Configuration/Configuration';
import { Conversation } from '@core/Conversation/Conversation';
import { ConsoleLogSink } from '@core/Logging/ConsoleLogSink';
import { FileLogSink } from '@core/Logging/FileLogSink';
import { ExecutionFileLogSink } from '@core/Logging/ExecutionFileLogSink';
import type { LogSink } from '@core/Logging/Log';
import { Logger } from '@core/Logging/Logger';
import { PayloadLogger } from '@core/Logging/PayloadLogger';
import { Task } from '@core/Task/Task';
import { ContextSelector } from '@context/Selector/ContextSelector';
import { ResearchResolver } from '@research/Resolver/ResearchResolver';
import { ResearchStore } from '@research/Store/ResearchStore';
import type { ModelAdapter } from '@model/Adapter/ModelAdapter';
import { MockModelAdapter } from '@model/Adapter/MockModelAdapter';
import { OpenAICompatibleModelAdapter } from '@model/Adapter/OpenAICompatibleModelAdapter';
import { ModelController } from '@model/Controller/ModelController';
import { DEFAULT_OPERATION_PROFILES } from '@operation/Default/DefaultOperationProfile';
import { OperationRegistry } from '@operation/Registry/OperationRegistry';
import { ProjectSession } from '@project/ProjectSession/ProjectSession';
import { ProjectScanner } from '@project/Scanner/ProjectScanner';
import { FileSystemTool } from '@model/Tool/FileSystem/FileSystemTool';
import { GitTool } from '@model/Tool/Git/GitTool';
import { ToolRegistry } from '@model/Tool/Registry/ToolRegistry';
import { SearchTool } from '@model/Tool/Search/SearchTool';
import { TerminalTool } from '@model/Tool/Terminal/TerminalTool';

export class Nodus {
  public readonly logger: Logger;
  public readonly projectSession: ProjectSession;
  public readonly operationRegistry: OperationRegistry;
  public readonly toolRegistry: ToolRegistry;
  private readonly conversations = new Map<string, Conversation>();
  private readonly runtime: AgentRuntime;

  public constructor(
    public readonly configuration: NodusConfiguration,
    human: HumanInteraction,
  ) {
    const sinks: LogSink[] = [];
    if (configuration.logging.console) {
      sinks.push(new ConsoleLogSink('error'));
    }
    if (configuration.logging.file) {
      sinks.push(new FileLogSink(resolve(configuration.project.root, configuration.logging.path ?? '.nodus/log/nodus.log')));
      sinks.push(new ExecutionFileLogSink(resolve(configuration.project.root, configuration.logging.executionPath ?? '.nodus/log/executions')));
    }
    this.logger = new Logger(configuration.logging.level, sinks);

    const researchStore = new ResearchStore();
    this.projectSession = new ProjectSession(configuration.project, researchStore, new ProjectScanner(), this.logger);

    this.operationRegistry = new OperationRegistry();
    for (const profile of DEFAULT_OPERATION_PROFILES) {
      this.operationRegistry.register(profile);
    }

    this.toolRegistry = new ToolRegistry();
    this.toolRegistry.register(new FileSystemTool());
    this.toolRegistry.register(new TerminalTool());
    this.toolRegistry.register(new GitTool());
    this.toolRegistry.register(new SearchTool());

    const adapter = this.createModelAdapter(configuration);
    const knowledgeResolver = new ResearchResolver(researchStore);
    const contextSelector = new ContextSelector(knowledgeResolver);
    const payloadLogger = new PayloadLogger(
      configuration.project.root,
      configuration.logging.executionPath ?? configuration.logging.payloadPath ?? '.nodus/log/executions',
    );
    const reporter = new ExecutionReporter(
      configuration.logging.console ? configuration.logging.consoleMode : 'quiet',
      configuration.logging.colors,
    );
    const stepRegistry = new StepRegistry();
    const planGenerator = new PlanGenerator(
      configuration.model,
      adapter,
      this.projectSession,
      this.logger,
      stepRegistry,
    );
    const recoveryController = new RecoveryController(
      configuration.model,
      adapter,
      stepRegistry,
      this.logger,
    );
    const planUpdater = new PlanUpdater();
    const requirementResolutionPlanner = new RequirementResolutionPlanner(
      configuration.model,
      adapter,
      this.projectSession,
      stepRegistry,
      this.logger,
    );

    const modelController = new ModelController(
      configuration.model,
      configuration.agent,
      configuration.logging,
      adapter,
      contextSelector,
      this.projectSession,
      this.operationRegistry,
      this.toolRegistry,
      this.logger,
      payloadLogger,
      reporter,
    );

    const toolExecutor = new ToolExecutor(this.toolRegistry, this.projectSession, this.logger);
    const patchApplyWorker = new PatchApplyWorker();
    const changeExecution = new ChangeExecution(
      new ChangeOptionResolver(),
      [
        new EditProposalWorker(modelController, toolExecutor, this.operationRegistry),
        new ChangePrepareWorker(this.toolRegistry, this.projectSession, patchApplyWorker),
        new ChangeValidationWorker(),
        new ChangeCommitWorker(this.toolRegistry, this.projectSession, this.logger),
      ],
    );

    const planExecutor = new PlanExecutor(
      this.operationRegistry,
      modelController,
      toolExecutor,
      changeExecution,
      human,
      recoveryController,
      planUpdater,
      this.logger,
      reporter,
      requirementResolutionPlanner,
    );

    this.runtime = new AgentRuntime(
      this.logger,
      reporter,
      planGenerator,
      planExecutor,
    );
  }

  public async initialize(): Promise<void> {
    if (this.configuration.logging.clearOnStart) await this.clearLogs();
    await this.projectSession.open();
  }

  public createConversation(id?: string): Conversation {
    const conversation = new Conversation(this.configuration.project.id, id);
    this.conversations.set(conversation.id, conversation);
    return conversation;
  }

  public getConversation(id: string): Conversation | undefined {
    return this.conversations.get(id);
  }

  public async runTask(description: string, conversationId: string, context?: Record<string, unknown>, planOverride?: TaskPlan | RequirementMap): Promise<string> {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    const task = new Task({
      projectId: this.configuration.project.id,
      conversationId,
      description,
      context,
    });

    conversation.addTask(task);
    await this.logger.info('task-received', { description }, {
      projectId: task.projectId,
      conversationId,
      taskId: task.id,
    });

    const execution = await this.runtime.execute(task, conversation, planOverride);
    const result = execution.result ?? execution.status;
    if (execution.status !== 'paused') conversation.completeTask(task.id, result);
    await this.logger.info('result', { status: execution.status, result }, {
      projectId: task.projectId,
      conversationId,
      taskId: task.id,
      executionId: execution.id,
    });
    return result;
  }

  public hasPausedExecution(conversationId: string): boolean {
    return this.runtime.hasPausedExecution(conversationId);
  }

  public stopPausedTask(conversationId: string): boolean {
    return this.runtime.cancelPaused(conversationId);
  }

  public async resumeTask(conversationId: string, hint?: string): Promise<string> {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) throw new Error(`Conversation not found: ${conversationId}`);

    const execution = await this.runtime.resume(conversationId, hint);
    if (!execution) return 'Нет приостановленного выполнения для продолжения.';

    const result = execution.result ?? execution.status;
    if (execution.status !== 'paused') conversation.completeTask(execution.taskId, result);
    await this.logger.info('result', { status: execution.status, result }, {
      projectId: this.configuration.project.id,
      conversationId,
      taskId: execution.taskId,
      executionId: execution.id,
    });
    return result;
  }


  private async clearLogs(): Promise<void> {
    const entries = new Map<string, boolean>();
    const add = (path: string | undefined, recursive: boolean) => {
      if (!path) return;
      const absolute = resolve(this.configuration.project.root, path);
      entries.set(absolute, Boolean(entries.get(absolute)) || recursive);
    };

    add(this.configuration.logging.path ?? '.nodus/log/nodus.log', false);
    add(this.configuration.logging.executionPath ?? '.nodus/log/executions', true);
    add(this.configuration.logging.payloadPath ?? '.nodus/log/executions', true);

    for (const [path, recursive] of entries) {
      await rm(path, { recursive, force: true });
    }

    await this.logger.info('logs-cleared', { paths: Array.from(entries.keys()) }, { projectId: this.configuration.project.id });
  }

  private createModelAdapter(configuration: NodusConfiguration): ModelAdapter {
    if (configuration.model.provider === 'mock') {
      return new MockModelAdapter();
    }

    if (!configuration.model.endpoint) {
      throw new Error('model.endpoint is required for openai-compatible provider');
    }

    return new OpenAICompatibleModelAdapter(configuration.model.endpoint, configuration.model.apiKey, configuration.model.requestTimeoutMs);
  }
}
