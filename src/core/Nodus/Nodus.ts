// Nodus.ts
import { resolve } from 'node:path';
import type { HumanInteraction } from '@agent/Human/HumanInteraction';
import { ChangeExecutor } from '@agent/Execution/ChangeExecutor';
import { ToolExecutor } from '@agent/Execution/ToolExecutor';
import { AgentRuntime } from '@agent/Runtime/AgentRuntime';
import type { NodusConfiguration } from '@core/Configuration/Configuration';
import { Conversation } from '@core/Conversation/Conversation';
import { ConsoleLogSink } from '@core/Logging/ConsoleLogSink';
import { FileLogSink } from '@core/Logging/FileLogSink';
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
import { PromptRegistry } from '@model/Profile/PromptRegistry';
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

  public constructor(
    public readonly configuration: NodusConfiguration,
    human: HumanInteraction,
  ) {
    const sinks: LogSink[] = [];
    if (configuration.logging.console) {
      sinks.push(new ConsoleLogSink());
    }
    if (configuration.logging.file) {
      sinks.push(new FileLogSink(resolve(configuration.project.root, configuration.logging.path ?? '.nodus/log/nodus.log')));
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
    const promptRegistry = new PromptRegistry();
    const knowledgeResolver = new KnowledgeResolver(knowledgeStore);
    const contextSelector = new ContextSelector(knowledgeResolver);
    const payloadLogger = new PayloadLogger(
      configuration.project.root,
      configuration.logging.payloadPath ?? '.nodus/log/payload',
    );
    const modelController = new ModelController(
      configuration.model,
      configuration.agent,
      configuration.logging,
      adapter,
      promptRegistry,
      contextSelector,
      this.projectSession,
      this.operationRegistry,
      this.toolRegistry,
      this.logger,
      payloadLogger,
    );

    const toolExecutor = new ToolExecutor(this.toolRegistry, this.projectSession, this.logger);
    const changeExecutor = new ChangeExecutor(this.toolRegistry, this.projectSession, this.logger);

    this.runtime = new AgentRuntime(
      configuration.agent,
      this.operationRegistry,
      modelController,
      toolExecutor,
      changeExecutor,
      human,
      this.logger,
    );
  }

  public async initialize(): Promise<void> {
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

  public async runTask(description: string, conversationId: string, context?: Record<string, unknown>): Promise<string> {
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

    const execution = await this.runtime.execute(task, conversation);
    const result = execution.result ?? execution.status;
    conversation.completeTask(task.id, result);
    await this.logger.info('result', { status: execution.status, result }, {
      projectId: task.projectId,
      conversationId,
      taskId: task.id,
      executionId: execution.id,
    });
    return result;
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
