import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RawAgentRunner } from '@agent/Raw/RawAgentRunner';
import type { ModelAdapter, RawModelResponse } from '@model/Adapter/ModelAdapter';
import type { ModelRequest } from '@model/Request/ModelRequest';
import { Logger } from '@core/Logging/Logger';
import type { ProjectSession } from '@project/ProjectSession/ProjectSession';
import { ToolRegistry } from '@tool/Registry/ToolRegistry';

class ScriptedAdapter implements ModelAdapter {
  public requests: ModelRequest[] = [];
  private call = 0;

  public async complete(request: ModelRequest): Promise<RawModelResponse> {
    this.requests.push(request);
    this.call += 1;
    if (this.call === 1) {
      return { content: 'search{"query":"commands"}[TOOL_CALLS]{"fake":true}' };
    }
    return { content: 'blocked cleanly' };
  }
}

const root = await mkdtemp(join(tmpdir(), 'nodus-raw-agent-transcript-'));
try {
  const registry = new ToolRegistry();
  const adapter = new ScriptedAdapter();
  const projectSession = {
    root,
    configuration: { id: 'raw-agent-transcript-smoke', root, exclude: [] },
  } as ProjectSession;
  const runner = new RawAgentRunner(
    { provider: 'mock', model: 'scripted', temperature: 0, maxTokens: 1000 },
    adapter,
    registry,
    projectSession,
    new Logger('error', []),
  );

  const result = await runner.run('test', 3);
  if (result.modelCalls !== 2 || result.toolCalls !== 0 || result.result !== 'blocked cleanly') {
    throw new Error(`Unexpected recovery result: ${JSON.stringify(result)}`);
  }
  const second = adapter.requests[1]?.messages ?? [];
  const reminder = second.at(-1)?.content ?? '';
  if (!reminder.includes('Do not print or replay tool-call protocol')) {
    throw new Error(`Missing transcript correction: ${JSON.stringify(second)}`);
  }
  console.log('RawAgentTranscriptRecoverySmoke passed');
} finally {
  await rm(root, { recursive: true, force: true });
}
