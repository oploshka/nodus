import { describe, expect, it } from 'vitest';
import type { ModelAdapter } from '../../../src/model/Adapter/ModelAdapter.js';
import { ModelRequestFormat } from '../../../src/model/Request/ModelRequestFormat.js';
import { ModelResponseFormat } from '../../../src/model/Response/ModelResponseFormat.js';
import { ExecutionPlannerResponseSchema } from '../../../src/model/Response/schema/ExecutionPlannerResponseSchema.js';
import { ModelRunner } from '../../../src/model/Runner/ModelRunner.js';

class SingleResponseAdapter implements ModelAdapter {
  public requests: Parameters<ModelAdapter['complete']>[0][] = [];
  public constructor(private readonly content: string) {}
  public async complete(request: Parameters<ModelAdapter['complete']>[0]) {
    this.requests.push(request);
    return { content: this.content, usage: { total_tokens: 12 } };
  }
}

describe('ModelRunner', () => {
  it('builds the request from message/data/guidance and returns a typed object', async () => {
    const adapter = new SingleResponseAdapter('ACTION research\nINPUT {"question":"where?"}');
    const runner = new ModelRunner(
      adapter,
      { provider: 'openai-compatible', endpoint: 'unused', model: 'test', temperature: 0.4, maxTokens: 4096 },
    );

    const result = await runner.run({
      request: {
        message: 'Choose the next action.',
        data: { available: ['research'] },
        format: ModelRequestFormat.Json,
        guidance: 'Use only available actions.',
      },
      response: {
        format: ModelResponseFormat.Raw,
        schema: new ExecutionPlannerResponseSchema(),
      },
      settings: { temperature: 0.1, maxTokens: 1000 },
    });

    expect(result.output).toEqual({ type: 'action', actionId: 'research', input: { question: 'where?' } });
    expect(result.usage?.total_tokens).toBe(12);
    expect(adapter.requests[0].temperature).toBe(0.1);
    expect(adapter.requests[0].maxTokens).toBe(1000);
    expect(adapter.requests[0].messages[0].content).toContain('Use only available actions.');
    expect(adapter.requests[0].messages[0].content).toContain('Expected raw schema');
    expect(adapter.requests[0].messages[1].content).toContain('"available"');
    expect(result).not.toHaveProperty('content');
  });

  it('diffFile is a thin specialized facade over the generic runner', async () => {
    const adapter = new SingleResponseAdapter([
      '--- a/src/A.ts',
      '+++ b/src/A.ts',
      '@@ -1,1 +1,1 @@',
      '-const a = 1;',
      '+const a = 2;',
    ].join('\n'));
    const runner = new ModelRunner(
      adapter,
      { provider: 'openai-compatible', endpoint: 'unused', model: 'test' },
    );

    const result = await runner.diffFile({
      path: 'src/A.ts',
      request: {
        message: 'Change a to 2.',
        data: 'const a = 1;',
      },
    });

    expect(result.output.path).toBe('src/A.ts');
    expect(result.output.hunks[0].lines).toHaveLength(2);
    expect(adapter.requests[0].messages[0].content).toContain('Return ONLY a unified diff.');
    expect(adapter.requests[0].messages[0].content).toContain('src/A.ts');
  });
});
