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
    const formattedPrompt = this.formatContextToPrompt(context);

    // Упрощаем инструкцию до обычного разговора
    const systemInstruction = `
You are Nodus AI - an elite software engineering assistant.
Analyze the provided project structure, files, and task. 
Answer the user's question directly in a clean, human-readable markdown format.
    `;

    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: formattedPrompt }
          ],
          temperature: 0.7, // Поднимаем температуру до 0.7 для креативности и ответов текстом
          // response_format: { type: 'json_object' } <-- ОБЯЗАТЕЛЬНО УДАЛЯЕМ ИЛИ КОММЕНТИРУЕМ ЭТУ СТРОКУ
        }),
      });

      if (!response.ok) {
        throw new Error(`Koboldcpp API error: ${response.statusText}`);
      }

      const data = await response.json();
      const rawText = data.choices?.message?.content?.trim() ?? '';

      // Возвращаем как чистое текстовое сообщение
      return {
        type: 'message',
        content: rawText,
      };

    } catch (error) {
      console.error('Failed to communicate with Koboldcpp:', error);
      return {
        type: 'message',
        content: `Ошибка вызова локальной модели: ${(error as Error).message}`,
      };
    }
  }

  private formatContextToPrompt(context: Context): string {
    let prompt = "Here is the current state of my project:\n\n";

    for (const item of context.items) {
      switch (item.type) {
        case 'task':
          prompt += `[USER TASK]:\n${item.content.description}\n\n`;
          break;
        case 'knowledge':
          prompt += `[PROJECT FILES]:\n${JSON.stringify(item.content.files, null, 2)}\n\n`;
          break;
        case 'message':
          prompt += `[CONTEXT/PLAN]:\n${JSON.stringify(item.content, null, 2)}\n\n`;
          break;
      }
    }

    return prompt;
  }
}
