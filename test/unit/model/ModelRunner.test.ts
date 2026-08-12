import { describe, expect, it } from 'vitest';
import type { ModelAdapter } from '../../../src/model/Adapter/ModelAdapter.js';
import { ModelRunner } from '../../../src/model/Runner/ModelRunner.js';
import { ExecutionPlannerResponseFormatter } from '../../../src/model/Response/ExecutionPlannerResponseFormatter.js';
import { EditFileResponseFormatter } from '../../../src/model/Response/EditFileResponseFormatter.js';

class SingleResponseAdapter implements ModelAdapter {
  public constructor(private readonly content: string) {}
  public async complete() { return { content: this.content, usage: { total_tokens: 12 } }; }
}

describe('ModelRunner', () => {
  it('does not expose raw text to engine callers', async () => {
    const runner = new ModelRunner(
      new SingleResponseAdapter('ACTION research\nINPUT {"question":"where?"}'),
      { provider: 'openai-compatible', endpoint: 'unused', model: 'test' },
    );
    const result = await runner.run({
      formatter: new ExecutionPlannerResponseFormatter(),
      messages: [{ role: 'user', content: 'next' }],
    });

    expect(result.output).toEqual({ type: 'action', actionId: 'research', input: { question: 'where?' } });
    expect(result.usage?.total_tokens).toBe(12);
    expect(result).not.toHaveProperty('content');
  });

  it('formats edit-file response into a typed object', () => {
    const formatter = new EditFileResponseFormatter('src/A.ts');
    const output = formatter.parse([
      'STATUS completed',
      'ACTION patch',
      'PATH src/A.ts',
      'DIFF',
      '--- a/src/A.ts',
      '+++ b/src/A.ts',
      '@@ -1,1 +1,1 @@',
      '-const a = 1;',
      '+const a = 2;',
    ].join('\n'));

    expect(output.action).toBe('patch');
    if (output.action === 'patch') expect(output.hunks[0].lines).toHaveLength(2);
  });
});
