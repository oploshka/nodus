// ModelMessageTransport.ts
import type { ModelMessage } from '@model/Request/ModelRequest';

export type ModelMessageLayout = 'collapsed-user' | 'layered';

/**
 * Converts Nodus logical input blocks into the physical chat-message layout
 * expected by the configured model transport.
 *
 * Logical blocks stay independent while composing context. For backends whose
 * chat templates require strict role alternation, consecutive user blocks are
 * collapsed into one user message before the request is sent or logged.
 */
export function transportMessages(
  messages: ModelMessage[],
  layout: ModelMessageLayout = 'collapsed-user',
): ModelMessage[] {
  if (layout === 'layered') return messages.map((message) => ({ ...message }));

  const result: ModelMessage[] = [];
  for (const message of messages) {
    const previous = result[result.length - 1];
    if (message.role === 'user' && previous?.role === 'user') {
      previous.content = `${previous.content.trim()}\n\n${message.content.trim()}`.trim();
      continue;
    }
    result.push({ ...message });
  }
  return result;
}
