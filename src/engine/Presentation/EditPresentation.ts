import type { Presentation, PresentedMessage } from '@engine/Presentation/Presentation.js';

export type EditPresentationEvent =
  | { type: 'change-set-prepare'; files: number }
  | { type: 'file-prepare'; path: string }
  | { type: 'file-prepared'; path: string; operations?: number }
  | { type: 'file-failed'; path: string; reason: string }
  | { type: 'change-set-failed'; path?: string }
  | { type: 'commit-start'; files: number }
  | { type: 'commit-finish'; files: number }
  | { type: 'diff-error'; path: string; attempt: number; max: number }
  | { type: 'diff-recovered'; path: string; attempt: number };

export class EditPresentation implements Presentation<EditPresentationEvent> {
  public readonly role = 'Edit';
  public readonly color = 'brightCyan' as const;

  public format(event: EditPresentationEvent, responseLanguage = 'en'): PresentedMessage {
    const ru = responseLanguage.toLowerCase().startsWith('ru');
    switch (event.type) {
      case 'change-set-prepare': return { text: ru ? `Подготавливаю набор изменений · файлов: ${event.files}` : `Preparing changes · files: ${event.files}` };
      case 'file-prepare': return { text: event.path };
      case 'file-prepared': return { text: `${ru ? 'Подготовлено' : 'Prepared'}${event.operations ? ` · ${event.operations} ${ru ? 'операций' : 'operations'}` : ''}` };
      case 'file-failed': return { text: `${ru ? 'Не удалось подготовить' : 'Failed to prepare'} · ${humanReason(event.reason, ru)}` };
      case 'change-set-failed': return { text: `${ru ? 'Набор изменений не подготовлен' : 'Change preparation failed'}${event.path ? ` · ${event.path}` : ''}` };
      case 'commit-start': return { text: ru ? `Применяю набор изменений · файлов: ${event.files}` : `Applying changes · files: ${event.files}` };
      case 'commit-finish': return { text: ru ? `Набор изменений применён · файлов: ${event.files}` : `Changes applied · files: ${event.files}` };
      case 'diff-error': return { text: ru ? `${event.path} · патч не применился (${event.attempt}/${event.max}), пробую восстановить` : `${event.path} · patch failed (${event.attempt}/${event.max}), trying recovery` };
      case 'diff-recovered': return { text: ru ? `${event.path} · восстановлено на попытке ${event.attempt}` : `${event.path} · recovered on attempt ${event.attempt}` };
    }
  }
}

function humanReason(reason: string, russian: boolean): string {
  if (/Range replace returned no operations/i.test(reason)) return russian ? 'точечная замена не предложила операций' : 'precise replacement returned no operations';
  if (/Replace returned no operations/i.test(reason)) return russian ? 'точная замена не предложила операций' : 'exact replacement returned no operations';
  if (/Patch context not found/i.test(reason)) return russian ? 'патч не удалось привязать к текущему содержимому' : 'patch context was not found';
  return reason;
}
