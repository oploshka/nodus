// StatusCommandScenario.ts
import { PlanCompiler } from '@agent/Planning/PlanCompiler';
import { STATUS_SCENARIO_REQUIREMENTS } from '@agent/Planning/Scenario/StatusScenario';
import { StepRegistry } from '@agent/Planning/StepRegistry';

export const STATUS_COMMAND_CANONICAL_PLAN = new PlanCompiler(new StepRegistry()).compile(STATUS_SCENARIO_REQUIREMENTS, 'ru');

export const STATUS_SEARCH_FACTS = [
  {
    key: 'evidence:project.id.definition',
    value: 'src/project/ProjectSession/ProjectSession.ts#projectId: public get projectId(): string',
    evidence: [{ path: 'src/project/ProjectSession/ProjectSession.ts', symbol: 'projectId', fact: 'ProjectSession exposes projectId.' }],
  },
  {
    key: 'evidence:conversation.id.definition',
    value: 'src/core/Conversation/Conversation.ts#id: public readonly id: string',
    evidence: [{ path: 'src/core/Conversation/Conversation.ts', symbol: 'id', fact: 'Conversation exposes readonly id.' }],
  },
  {
    key: 'evidence:project.index.files',
    value: 'src/project/Index/ProjectIndex.ts#files: files: ProjectFileFact[]',
    evidence: [{ path: 'src/project/Index/ProjectIndex.ts', symbol: 'files', fact: 'ProjectIndex exposes files.' }],
  },
] as const;

export const STATUS_INTEGRATION_FACTS = [
  {
    key: 'fact:project.id.access@cli',
    value: 'Use nodus.projectSession.projectId from the CLI runtime context.',
    evidence: [{ path: 'src/project/ProjectSession/ProjectSession.ts', symbol: 'projectId', fact: 'ProjectSession exposes projectId.' }],
  },
  {
    key: 'fact:conversation.id.access@cli',
    value: 'Use conversation.id from the active CLI conversation.',
    evidence: [{ path: 'src/core/Conversation/Conversation.ts', symbol: 'id', fact: 'Conversation exposes readonly id.' }],
  },
  {
    key: 'fact:project.index.fileCount.access@cli',
    value: 'Use nodus.projectSession.index?.files.length and handle an unavailable index.',
    evidence: [{ path: 'src/project/Index/ProjectIndex.ts', symbol: 'files', fact: 'ProjectIndex exposes files.' }],
  },
  {
    key: 'fact:cli.command.pattern@cli',
    value: 'Add the command to COMMANDS and dispatch it with an explicit inline if branch using console.log.',
    evidence: [{ path: 'src/cli/Cli.ts', symbol: 'runCli', fact: 'CLI uses COMMANDS plus inline command branches.' }],
  },
] as const;

export const STATUS_CHANGE_FACT = {
  key: 'change-definition:status.command',
  value: 'Edit only src/cli/Cli.ts: add /status to COMMANDS and one inline handler using the established CLI access facts.',
  evidence: [{ path: 'src/cli/Cli.ts', fact: 'Target selected by the requirement map.' }],
} as const;

export const STATUS_CLI_SOURCE = `// Cli.ts\nconst COMMANDS = [\n  { name: '/help', description: 'Show help.' },\n];\n\nexport async function runCli(): Promise<void> {\n  const value = '/help';\n  if (value === '/help') console.log('help');\n}\n`;
