// Nodus.ts
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { HumanInteraction } from '@agent/Human/HumanInteraction';
import { ChangeExecutor } from '@agent/Execution/ChangeExecutor';
import { ToolExecutor } from '@agent/Execution/ToolExecutor';
import { AgentRuntime } from '@agent/Runtime/AgentRuntime';
import { RawAgentRunner } from '@agent/Raw/RawAgentRunner';
import { ExecutionReporter } from '@agent/Reporting/ExecutionReporter';
import { PlanGenerator } from '@agent/Planning/PlanGenerator';
import type { RequirementMap } from '@agent/Planning/RequirementMap';
import type { TaskPlan } from '@agent/Planning/TaskPlan';
import { PlanExecutor } from '@agent/Planning/PlanExecutor';
import { PlanUpdater } from '@agent/Planning/PlanUpdater';
import { RecoveryController } from '@agent/Planning/RecoveryController';
import { RequirementResolutionPlanner } from '@agent/Planning/RequirementResolutionPlanner';
import { StepRegistry } from '@agent/Planning/StepRegistry';
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
import { KnowledgeResolver } from '@knowledge/Resolver/KnowledgeResolver';
import { KnowledgeStore } from '@knowledge/Store/KnowledgeStore';
import type { ModelAdapter } from '@model/Adapter/ModelAdapter';
import { MockModelAdapter } from '@model/Adapter/MockModelAdapter';
import { OpenAICompatibleModelAdapter } from '@model/Adapter/OpenAICompatibleModelAdapter';
import { ModelController } from '@model/Controller/ModelController';
import { DEFAULT_OPERATION_PROFILES } from '@operation/Default/DefaultOperationProfile';
import { OperationRegistry } from '@operation/Registry/OperationRegistry';
import { ProjectSession } from '@project/ProjectSession/ProjectSession';
import { ProjectScanner } from '@project/Scanner/ProjectScanner';
import { FileSystemTool } from '@tool/FileSystem/FileSystemTool';
import { GitTool } from '@tool/Git/GitTool';
import { ToolRegistry } from '@tool/Registry/ToolRegistry';
import { SearchTool } from '@tool/Search/SearchTool';
import { TerminalTool } from '@tool/Terminal/TerminalTool';

export class Nodus {
  public readonly logger: Logger;
  public readonly projectSession: ProjectSession;
  public readonly operationRegistry: OperationRegistry;
  public readonly toolRegistry: ToolRegistry;
  private readonly conversations = new Map<string, Conversation>();
  private readonly runtime: AgentRuntime;
  private readonly rawAgentRunner: RawAgentRunner;

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

    const knowledgeStore = new KnowledgeStore();
    this.projectSession = new ProjectSession(configuration.project, knowledgeStore, new ProjectScanner(), this.logger);

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
    this.rawAgentRunner = new RawAgentRunner(
      configuration.model,
      adapter,
      this.toolRegistry,
      this.projectSession,
      this.logger,
    );
    const knowledgeResolver = new KnowledgeResolver(knowledgeStore);
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
    const changeExecutor = new ChangeExecutor(this.toolRegistry, this.projectSession, this.logger);

    const planExecutor = new PlanExecutor(
      this.operationRegistry,
      modelController,
      toolExecutor,
      changeExecutor,
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

  public async runRawAgentTask(description: string): Promise<string> {
    const result = await this.rawAgentRunner.run(description, this.configuration.agent.maxSteps);
    console.log(`Raw agent: ${result.modelCalls} model calls, ${result.toolCalls} tool calls`);
    console.log(result.result);
    return result.result;
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

    return new OpenAICompatibleModelAdapter(configuration.model.endpoint, configuration.model.apiKey);
  }
}
