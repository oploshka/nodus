import { describe, expect, it } from 'vitest';
import type { ModelAdapter } from '@model/Adapter/ModelAdapter.js';
import { ModelRequestFormat } from '@model/Request/ModelRequestFormat.js';
import { ModelResponseFormat } from '@model/Response/ModelResponseFormat.js';
import type { ModelResponseSchema } from '@model/Response/ModelResponseSchema.js';
import { ModelRunner } from '@model/Runner/ModelRunner.js';
import { callModel } from '@model/Runner/ModelCaller.js';

class SingleResponseAdapter implements ModelAdapter {
  public requests: Parameters<ModelAdapter['complete']>[0][] = [];
  public constructor(private readonly content: string) {}
  public async complete(request: Parameters<ModelAdapter['complete']>[0]) {
    this.requests.push(request);
    return {
      content: this.content,
      usage: { prompt_tokens: 7, completion_tokens: 5, total_tokens: 12 },
      finishReason: 'stop',
    };
  }
}

interface DecisionResponse {
  status: 'action' | 'completed' | 'failed';
  actionId?: string;
  input?: unknown;
}

const decisionSchema: ModelResponseSchema = {
  fields: {
    status: {
      type: 'option',
      optionList: [
        { id: 'action', description: 'Run an action.' },
        { id: 'completed', description: 'The work is complete.' },
        { id: 'failed', description: 'The work cannot be completed.' },
      ],
    },
    actionId: { type: 'string', optional: true },
    input: { type: 'any', optional: true },
  },
};

describe('ModelRunner', () => {
  it('uses one common object schema and returns data + exchange + meta', async () => {
    const adapter = new SingleResponseAdapter('{"status":"action","actionId":"research","input":{"question":"where?"}}');
    const runner = new ModelRunner(
      adapter,
      { provider: 'openai-compatible', endpoint: 'unused', model: 'test', temperature: 0.4, maxTokens: 4096 },
    );

    const result = await runner.run<DecisionResponse>({
      request: {
        message: 'Choose the next action.',
        data: { available: ['research'] },
        format: ModelRequestFormat.Json,
        guidance: 'Use only available actions.',
      },
      response: { format: ModelResponseFormat.Json, schema: decisionSchema },
      settings: { temperature: 0.1, maxTokens: 1000 },
    });

    expect(result.data).toEqual({ status: 'action', actionId: 'research', input: { question: 'where?' } });
    expect(result.exchange.request[0]).toMatchObject({ role: 'system' });
    expect(result.exchange.request[1]).toMatchObject({ role: 'user' });
    expect(result.exchange.response).toEqual([{ role: 'assistant', message: adapter['content'] }]);
    expect(result.meta).toMatchObject({ model: 'test', temperature: 0.1, maxTokens: 1000, totalTokens: 12, finishReason: 'stop' });
    expect(result.meta.durationMs).toBeGreaterThanOrEqual(0);
    expect(adapter.requests[0].messages[0].content).toContain('Use only available actions.');
    expect(adapter.requests[0].messages[0].content).toContain('status: option');
    expect(adapter.requests[0].messages[1].content).toContain('"available"');
  });

  it('ModelCaller logs the complete result and exposes only data', async () => {
    const adapter = new SingleResponseAdapter('{"status":"completed"}');
    const runner = new ModelRunner(adapter, { provider: 'openai-compatible', endpoint: 'unused', model: 'test' });
    const logged: unknown[] = [];

    const data = await callModel<{ status: 'action' | 'completed' | 'failed' }>(runner, {
      info(_event, value) { logged.push(value); },
    }, {
      request: { message: 'Finish.', format: ModelRequestFormat.Text },
      response: { format: ModelResponseFormat.Json, schema: decisionSchema },
    });

    expect(data).toEqual({ status: 'completed' });
    expect(logged).toHaveLength(1);
    expect(logged[0]).toHaveProperty('exchange');
    expect(logged[0]).toHaveProperty('meta');
  });

  it('diffFile stays a thin specialized facade over the same runner contract', async () => {
    const adapter = new SingleResponseAdapter([
      '--- a/src/A.ts',
      '+++ b/src/A.ts',
      '@@ -1,1 +1,1 @@',
      '-const a = 1;',
      '+const a = 2;',
    ].join('\n'));
    const runner = new ModelRunner(adapter, { provider: 'openai-compatible', endpoint: 'unused', model: 'test' });

    const result = await runner.diffFile({
      path: 'src/A.ts',
      request: { message: 'Change a to 2.', data: 'const a = 1;' },
    });

    expect(result.data.path).toBe('src/A.ts');
    expect(result.data.hunks[0].lines).toHaveLength(2);
    expect(adapter.requests[0].messages[0].content).toContain('Return ONLY a unified diff.');
    expect(adapter.requests[0].messages[0].content).toContain('File path modified by the diff.');
  });
});
