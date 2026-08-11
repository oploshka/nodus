// OpenAICompatibleModelAdapter.ts
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import type { IncomingHttpHeaders } from 'node:http';
import type { ModelAdapter, ModelUsage, RawModelResponse } from '@model/Adapter/ModelAdapter';
import type { ModelRequest } from '@model/Request/ModelRequest';

interface OpenAICompatibleResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: ModelUsage;
  error?: { message?: string };
}

interface TransportResponse {
  status: number;
  headers: IncomingHttpHeaders;
  body: string;
}

export type ModelTransportErrorKind = 'timeout' | 'connection' | 'transport';

export class ModelTransportError extends Error {
  public override readonly name = 'ModelTransportError';

  public constructor(
    message: string,
    public readonly kind: ModelTransportErrorKind = 'transport',
  ) {
    super(message);
  }
}

export class OpenAICompatibleModelAdapter implements ModelAdapter {
  public constructor(
    private readonly endpoint: string,
    private readonly apiKey?: string,
    private readonly requestTimeoutMs = 600_000,
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
    const url = new URL(`${this.endpoint.replace(/\/$/, '')}/chat/completions`);
    const body = JSON.stringify({
      model: request.model,
      messages: request.messages,
      temperature: request.temperature,
      max_tokens: request.maxTokens,
    });

    const response = await this.post(url, body);
    const payload = this.parseResponsePayload(response);

    if (response.status < 200 || response.status >= 300) {
      throw new Error(payload.error?.message ?? `Model request failed with HTTP ${response.status}`);
    }

    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('Model returned an empty response');
    }

    return { content, usage: payload.usage };
  }

  private post(url: URL, body: string): Promise<TransportResponse> {
    return new Promise((resolve, reject) => {
      const transport = url.protocol === 'https:' ? httpsRequest : url.protocol === 'http:' ? httpRequest : undefined;
      if (!transport) {
        reject(new ModelTransportError(`Unsupported model endpoint protocol: ${url.protocol}`, 'transport'));
        return;
      }

      let settled = false;
      let timer: ReturnType<typeof setTimeout>;
      const finishReject = (error: ModelTransportError) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      };

      const request = transport(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(body),
          ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
        },
      }, (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer | string) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        response.on('end', () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve({
            status: response.statusCode ?? 0,
            headers: response.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
        response.on('error', (error) => finishReject(this.transportError(error)));
      });

      timer = setTimeout(() => {
        request.destroy();
        finishReject(new ModelTransportError(
          `Model request timed out after ${this.requestTimeoutMs} ms while waiting for the response. The model server may still be running.`,
          'timeout',
        ));
      }, this.requestTimeoutMs);

      request.on('error', (error) => finishReject(this.transportError(error)));
      request.write(body);
      request.end();
    });
  }

  private parseResponsePayload(response: TransportResponse): OpenAICompatibleResponse {
    const candidates = [response.body, this.unwrapEmbeddedHttpResponse(response.body)]
      .map((value) => value.trim())
      .filter((value, index, values) => value.length > 0 && values.indexOf(value) === index);

    for (const candidate of candidates) {
      try {
        return JSON.parse(candidate) as OpenAICompatibleResponse;
      } catch {
        // Try the next transport representation before classifying the response as malformed.
      }
    }

    const contentType = Array.isArray(response.headers['content-type'])
      ? response.headers['content-type'].join(', ')
      : response.headers['content-type'] ?? 'unknown';
    const preview = response.body.replace(/\s+/g, ' ').trim().slice(0, 240);
    throw new ModelTransportError(
      `Model returned a non-JSON transport response (HTTP ${response.status}, content-type ${contentType}): ${preview || '<empty body>'}`,
      'transport',
    );
  }

  private unwrapEmbeddedHttpResponse(rawBody: string): string {
    let body = rawBody.trimStart();
    for (let depth = 0; depth < 3 && /^HTTP\/1\.[01]\s+\d{3}\b/i.test(body); depth += 1) {
      const crlfBoundary = body.indexOf('\r\n\r\n');
      const lfBoundary = body.indexOf('\n\n');
      const boundary = crlfBoundary >= 0 ? crlfBoundary + 4 : lfBoundary >= 0 ? lfBoundary + 2 : -1;
      if (boundary < 0) break;
      body = body.slice(boundary).trimStart();
    }
    return body;
  }

  private isRetryableTransportError(error: unknown): boolean {
    // A timeout may mean the model is still generating. Retrying it immediately can
    // duplicate a very expensive request, so let Nodus pause/resume instead.
    return error instanceof ModelTransportError && error.kind === 'connection';
  }

  private transportError(error: unknown): ModelTransportError {
    if (!(error instanceof Error)) return new ModelTransportError(String(error), 'transport');
    const code = 'code' in error && typeof error.code === 'string' ? error.code : undefined;
    const connectionCodes = new Set(['ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH', 'ENETUNREACH', 'ENOTFOUND']);
    const kind: ModelTransportErrorKind = code && connectionCodes.has(code) ? 'connection' : 'transport';
    return new ModelTransportError(`${error.message}${code ? ` (${code})` : ''}`, kind);
  }
}
