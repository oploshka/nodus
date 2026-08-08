// index.ts

import { Agent } from '@core/Agent/Agent';
import { ContextBuilder } from '@core/Context/ContextBuilder';
import { ConfigurationLoader } from '@core/Configuration/ConfigurationLoader';
import { MemoryStore } from '@core/Memory/MemoryStore';
import { Planner } from '@core/Planning/Planner';
import type { Task } from '@core/Task/Task';

import { DependencyIndexer } from '@knowledge/Dependency/DependencyIndexer';
import { ProjectIndexer } from '@knowledge/Index/ProjectIndexer';
import { Rag } from '@knowledge/Rag/Rag';

import { ModelFactory } from '@model/ModelFactory';
import { MockModelAdapter } from '@model/Adapter/MockModelAdapter';

import { ProjectScanner } from '@project/Scanner/ProjectScanner';

import { FileSystemTool } from '@tool/FileSystem/FileSystemTool';
import { GitTool } from '@tool/Git/GitTool';
import { TerminalTool } from '@tool/Terminal/TerminalTool';
import { TestingTool } from '@tool/Testing/TestingTool';
import { ToolRegistry } from '@tool/ToolRegistry';

const configuration = new ConfigurationLoader();
const config = configuration.load();

const scanner = new ProjectScanner();
const project = await scanner.scan(config.projectRoot);

const indexer = new ProjectIndexer();
const index = await indexer.index(project);

const dependencyIndexer = new DependencyIndexer();
const dependencies = dependencyIndexer.build(index);

const rag = new Rag();
await rag.build(index);

const memory = new MemoryStore();
const planner = new Planner(memory);

const task: Task = {
  id: '1',
  description: 'Analyze the project',
  status: 'pending',
};

const plan = await planner.create(task);

const terminal = new TerminalTool();

const tools = new ToolRegistry();

tools.register(new FileSystemTool());
tools.register(terminal);
tools.register(new GitTool(terminal));
tools.register(new TestingTool(terminal));

const model = new ModelFactory().create(
  {
    provider: config.model.provider,
    model: config.model.model,
  },
  new MockModelAdapter(),
);

const contextBuilder = new ContextBuilder();

contextBuilder
  .addTask(task)
  .addProject(index)
  .addPlan(plan);

const ragResults = await rag.search(
  task.description,
);

contextBuilder.addSearchResults(ragResults);

const agent = new Agent(
  model,
  tools,
  contextBuilder,
  memory,
);

console.log(
  await agent.execute(task),
);

console.log({
  project,
  dependencies,
  memory: memory.get(),
});