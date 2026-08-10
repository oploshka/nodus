import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RawAgentRunner } from '@agent/Raw/RawAgentRunner';
import type { ModelAdapter, RawModelResponse } from '@model/Adapter/ModelAdapter';
import type { ModelRequest } from '@model/Request/ModelRequest';
import { Logger } from '@core/Logging/Logger';
import type { ProjectSession } from '@project/ProjectSession/ProjectSession';
import { FileSystemTool } from '@tool/FileSystem/FileSystemTool';
import { ToolRegistry } from '@tool/Registry/ToolRegistry';

class ScriptedAdapter implements ModelAdapter {
  private call = 0;

  public async complete(_request: ModelRequest): Promise<RawModelResponse> {
    this.call += 1;
    if (this.call === 1) {
      return {
        content: 'file-system{\"action\":\"write\"}',
        toolCalls: [{
          id: 'call-1',
          type: 'function',
          function: {
            name: 'file-system',
            arguments: JSON.stringify({ action: 'write', path: 'raw-agent.txt', content: 'ok' }),
          },
        }],
      };
    }
    return { content: 'done' };
  }
}

const root = await mkdtemp(join(tmpdir(), 'nodus-raw-agent-'));
try {
  const registry = new ToolRegistry();
  registry.register(new FileSystemTool());
  const projectSession = {
    root,
    configuration: { id: 'raw-agent-smoke', root, exclude: [] },
  } as ProjectSession;
  const runner = new RawAgentRunner(
    { provider: 'mock', model: 'scripted', temperature: 0, maxTokens: 1000 },
    new ScriptedAdapter(),
    registry,
    projectSession,
    new Logger('error', []),
  );

  const result = await runner.run('write the test file', 4);
  const content = await readFile(join(root, 'raw-agent.txt'), 'utf8');
  if (content !== 'ok') throw new Error(`Unexpected file content: ${content}`);
  if (result.modelCalls !== 2 || result.toolCalls !== 1 || result.result !== 'done') {
    throw new Error(`Unexpected raw-agent result: ${JSON.stringify(result)}`);
  }
  if (result.projectRoot !== root || result.trace.length !== 1 || result.trace[0]?.tool !== 'file-system' || result.trace[0]?.ok !== true) {
    throw new Error(`Unexpected raw-agent trace: ${JSON.stringify(result)}`);
  }
  console.log('RawAgentRunnerSmoke passed');
} finally {
  await rm(root, { recursive: true, force: true });
}
