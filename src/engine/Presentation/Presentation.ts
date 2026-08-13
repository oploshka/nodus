export type PresentationColor =
  | 'gray'
  | 'white'
  | 'cyan'
  | 'brightCyan'
  | 'magenta'
  | 'brightMagenta'
  | 'blue'
  | 'yellow'
  | 'green'
  | 'red';

export interface PresentedMessage {
  text: string;
  details?: string[];
}

/**
 * User-facing presentation contract for one runtime role/component.
 * Runtime ids and diagnostic payloads stay separate from presentation.
 */
export interface Presentation<TEvent = unknown> {
  readonly role: string;
  readonly color: PresentationColor;
  format(event: TEvent, responseLanguage?: string): PresentedMessage | undefined;
}

export interface LocalizedText {
  en: string;
  ru?: string;
}

export function localized(text: LocalizedText, responseLanguage = 'en'): string {
  return responseLanguage.toLowerCase().startsWith('ru') ? (text.ru ?? text.en) : text.en;
}
