// src/model/Adapter/KoboldAdapter.ts
import type { Context } from '@core/Context/Context';
import type { ModelAdapter } from '@model/Adapter/ModelAdapter';
import type { ModelResponse } from '@model/Response';

export class KoboldAdapter implements ModelAdapter {
  private readonly apiUrl: string;

  constructor(endpoint = 'http://localhost:5001/v1') {
    this.apiUrl = `${endpoint}/chat/completions`;
  }

  async send(context: Context): Promise<ModelResponse> {
    // 1. Трансформируем элементы контекста Nodus в системный промпт для LLM
    const formattedPrompt = this.formatContextToPrompt(context);

    // 2. Формируем системные инструкции, как модель должна отвечать (JSON)
    const systemInstruction = `
You are Nodus AI - an advanced software engineering agent.
Analyze the project context and decide on the next step.

CRITICAL: You must respond ONLY with a valid JSON object matching one of these two formats:

1. If you need to give a final text answer to the user:
{
  "type": "message",
  "content": "Your analysis or answer here"
}

2. If you need to use a tool (FileSystemTool, TerminalTool, GitTool, TestingTool):
{
  "type": "tool",
  "tool": {
    "name": "FileSystemTool",
    "input": { "action": "read", "path": "src/index.ts" }
  }
}

Do not include any markdown block wraps like \`\`\`json. Return pure raw JSON string.
    `;

    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          // Koboldcpp / OpenAI формат
          messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: formattedPrompt }
          ],
          temperature: 0.2, // Низкая температура для стабильного JSON
          response_format: { type: 'json_object' } // Если модель поддерживает JSON-мод
        }),
      });

      if (!response.ok) {
        throw new Error(`Koboldcpp API error: ${response.statusText}`);
      }

      const data = await response.json();
      const rawText = data.choices[0]?.message?.content?.trim() ?? '';

      // 3. Парсим ответ модели в типы Nodus
      return this.parseResponse(rawText);

    } catch (error) {
      console.error('Failed to communicate with Koboldcpp:', error);
      // В случае падения возвращаем фолбек-сообщение, чтобы агент не крашил весь процесс
      return {
        type: 'message',
        content: `Ошибка вызова локальной модели: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Склеивает разрозненные элементы контекста Nodus в понятный для LLM текст
   */
  private formatContextToPrompt(context: Context): string {
    let prompt = "--- CURRENT CONTEXT ---\n";

    for (const item of context.items) {
      switch (item.type) {
        case 'task':
          prompt += `[TASK]: ${JSON.stringify(item.content)}\n`;
          break;
        case 'knowledge':
          prompt += `[PROJECT STRUCTURE/INDEX]: ${JSON.stringify(item.content)}\n`;
          break;
        case 'message':
          prompt += `[PLAN OR HISTORIC MESSAGE]: ${JSON.stringify(item.content)}\n`;
          break;
        case 'tool':
          prompt += `[TOOL EXECUTION RESULT]: ${JSON.stringify(item.content)}\n`;
          break;
        default:
          prompt += `[UNKNOWN ITEM]: ${JSON.stringify(item.content)}\n`;
      }
    }

    return prompt;
  }

  /**
   * Безопасно очищает и парсит JSON от модели
   */
  private parseResponse(rawText: string): ModelResponse {
    try {
      // На случай, если модель проигнорировала инструкцию и бахнула блоки кода ```json ... ```
      const cleanJson = rawText
        .replace(/^```json/i, '')
        .replace(/```$/, '')
        .trim();

      const parsed = JSON.parse(cleanJson);

      if (parsed.type === 'message' || parsed.type === 'tool') {
        return parsed as ModelResponse;
      }

      throw new Error('JSON misses required type field');
    } catch {
      // Если модель вернула обычный текст вместо JSON, оборачиваем его в 'message'
      return {
        type: 'message',
        content: rawText,
      };
    }
  }
}
