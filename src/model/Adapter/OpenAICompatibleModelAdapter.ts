// OpenAICompatibleModelAdapter.ts
import type { ModelAdapter, ModelUsage, RawModelResponse } from '@model/Adapter/ModelAdapter';
import type { ModelRequest } from '@model/Request/ModelRequest';

interface OpenAICompatibleResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: ModelUsage;
  error?: { message?: string };
}

export class ModelTransportError extends Error {
  public override readonly name = 'ModelTransportError';
}

export class OpenAICompatibleModelAdapter implements ModelAdapter {
  public constructor(
    private readonly endpoint: string,
    private readonly apiKey?: string,
  ) {}

  public async complete(request: ModelRequest): Promise<RawModelResponse> {
    const maxTransportAttempts = 2;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxTransportAttempts; attempt += 1) {
      try {
        return await this.completeOnce(request);
      } catch (error) {
        lastError = error;
        if (!this.isRetryableTransportError(error) || attempt >= maxTransportAttempts) {
          throw error;
        }
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  private async completeOnce(request: ModelRequest): Promise<RawModelResponse> {
    let response: Response;

    try {
      response = await fetch(`${this.endpoint.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: request.model,
          messages: request.messages,
          temperature: request.temperature,
          max_tokens: request.maxTokens,
        }),
      });
    } catch (error) {
      throw new ModelTransportError(`Model transport request failed: ${this.describeError(error)}`);
    }

    const rawBody = await response.text();
    const payload = this.parseResponsePayload(response, rawBody);

    if (!response.ok) {
      throw new Error(payload.error?.message ?? `Model request failed with HTTP ${response.status}`);
    }

    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('Model returned an empty response');
    }

    return {
      content,
      usage: payload.usage,
    };
  }

  private parseResponsePayload(response: Response, rawBody: string): OpenAICompatibleResponse {
    const candidates = [rawBody, this.unwrapEmbeddedHttpResponse(rawBody)]
      .map((value) => value.trim())
      .filter((value, index, values) => value.length > 0 && values.indexOf(value) === index);

    for (const candidate of candidates) {
      try {
        return JSON.parse(candidate) as OpenAICompatibleResponse;
      } catch {
        // Try the next transport representation before classifying the response as malformed.
      }
    }

    const contentType = response.headers.get('content-type') ?? 'unknown';
    const preview = rawBody.replace(/\s+/g, ' ').trim().slice(0, 240);
    throw new ModelTransportError(
      `Model returned a non-JSON transport response (HTTP ${response.status}, content-type ${contentType}): ${preview || '<empty body>'}`,
    );
  }

  private unwrapEmbeddedHttpResponse(rawBody: string): string {
    let body = rawBody.trimStart();

    for (let depth = 0; depth < 3 && /^HTTP\/1\.[01]\s+\d{3}\b/i.test(body); depth += 1) {
      const crlfBoundary = body.indexOf('\r\n\r\n');
      const lfBoundary = body.indexOf('\n\n');
      const boundary = crlfBoundary >= 0 ? crlfBoundary + 4 : lfBoundary >= 0 ? lfBoundary + 2 : -1;

      if (boundary < 0) {
        break;
      }

      body = body.slice(boundary).trimStart();
    }

    return body;
  }

  private isRetryableTransportError(error: unknown): boolean {
    return error instanceof ModelTransportError;
  }

  private describeError(error: unknown): string {
    if (!(error instanceof Error)) return String(error);

    const cause = error.cause;
    if (cause instanceof Error && cause.message && cause.message !== error.message) {
      const code = 'code' in cause && typeof cause.code === 'string' ? ` (${cause.code})` : '';
      return `${error.message}: ${cause.message}${code}`;
    }

    return error.message;
  }
}
