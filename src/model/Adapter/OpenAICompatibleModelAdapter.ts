import type { ModelAdapter, RawModelResponse } from './ModelAdapter.js';
import type { ModelRequest } from '../Request/ModelRequest.js';

interface OpenAICompatibleResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: RawModelResponse['usage'];
  error?: { message?: string };
}

export class OpenAICompatibleModelAdapter implements ModelAdapter {
  public constructor(
    private readonly endpoint: string,
    private readonly apiKey?: string,
    private readonly requestTimeoutMs = 600_000,
  ) {}

  public async complete(request: ModelRequest): Promise<RawModelResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.requestTimeoutMs);
    try {
      const response = await fetch(`${this.endpoint.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
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
      const raw = await response.text();
      let payload: OpenAICompatibleResponse;
      try { payload = JSON.parse(raw) as OpenAICompatibleResponse; }
      catch { throw new Error(`Model returned non-JSON response: ${raw.slice(0, 240)}`); }
      if (!response.ok) throw new Error(payload.error?.message ?? `Model request failed with HTTP ${response.status}`);
      const content = payload.choices?.[0]?.message?.content;
      if (!content) throw new Error('Model returned an empty response');
      return { content, usage: payload.usage };
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error(`Model request timed out after ${this.requestTimeoutMs} ms`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}
