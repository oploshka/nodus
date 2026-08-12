import type { Logger } from '../../src/app/logging/Logger.js';
import type { ModelAdapter, RawModelResponse } from '../../src/model/Adapter/ModelAdapter.js';
import type { ModelRequest } from '../../src/model/Request/ModelRequest.js';

/** Deterministic model used by unit/integration scenarios. */
export class QueueModelAdapter implements ModelAdapter {
  public readonly requests: ModelRequest[] = [];

  public constructor(
    private readonly responses: string[],
    private readonly logger?: Logger,
  ) {}

  public async complete(request: ModelRequest): Promise<RawModelResponse> {
    const index = this.requests.length + 1;
    this.requests.push(request);
    this.logger?.info('test.model.request', { index, request });

    const content = this.responses.shift();
    if (content === undefined) throw new Error(`Model response queue exhausted at request ${index}`);

    this.logger?.info('test.model.response', { index, content });
    return { content };
  }

  public get remainingResponses(): number { return this.responses.length; }
}

/** Adds the same test log around any real/fake ModelAdapter. */
export class LoggedModelAdapter implements ModelAdapter {
  public readonly requests: ModelRequest[] = [];

  public constructor(
    private readonly inner: ModelAdapter,
    private readonly logger: Logger,
  ) {}

  public async complete(request: ModelRequest): Promise<RawModelResponse> {
    const index = this.requests.length + 1;
    this.requests.push(request);
    this.logger.info('test.model.request', { index, request });
    try {
      const response = await this.inner.complete(request);
      this.logger.info('test.model.response', { index, response });
      return response;
    } catch (error) {
      this.logger.error('test.model.error', { index, error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }
}
