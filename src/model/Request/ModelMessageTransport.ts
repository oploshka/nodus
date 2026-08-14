import type { ModelMessage } from '@model/Request/ModelRequest.js';

export type ModelMessageLayout = 'collapsed-user' | 'layered';

export function transportMessages(
  messages: ModelMessage[],
  layout: ModelMessageLayout = 'collapsed-user',
): ModelMessage[] {
  if (layout === 'layered') return messages.map((message) => ({ ...message }));

  const result: ModelMessage[] = [];
  for (const message of messages) {
    const previous = result[result.length - 1];
    if (message.role === 'user' && previous?.role === 'user') {
      previous.content = `${previous.content.trim()}

${message.content.trim()}`.trim();
      continue;
    }
    result.push({ ...message });
  }
  return result;
}
