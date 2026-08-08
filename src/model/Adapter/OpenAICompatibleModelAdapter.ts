// OpenAICompatibleModelAdapter.ts
import type {
  ModelAdapter,
  ModelUsage,
  RawModelResponse,
} from '@model/Adapter/ModelAdapter';
import type { ModelRequest } from '@model/Request/ModelRequest';


interface OpenAICompatibleResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: ModelUsage;
  error?: { message?: string };
}

export class OpenAICompatibleModelAdapter implements ModelAdapter {
  public constructor(
    private readonly endpoint: string,
    private readonly apiKey?: string,
  ) {}

  public async complete(request: ModelRequest): Promise<RawModelResponse> {
    const response = await fetch(`${this.endpoint.replace(/\/$/, '')}/chat/completions`, {
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

    const payload = await response.json() as OpenAICompatibleResponse;
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
}
