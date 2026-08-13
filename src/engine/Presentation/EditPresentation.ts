import type { Presentation, PresentedMessage } from '@engine/Presentation/Presentation.js';

export type EditPresentationEvent =
  | { type: 'change-set-prepare'; edits: number }
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
      case 'change-set-prepare': return { text: ru ? `Подготавливаю change-set · изменений: ${event.edits}` : `Preparing change-set · edits: ${event.edits}` };
      case 'file-prepare': return { text: ru ? `Подготавливаю изменения: ${event.path}` : `Preparing changes: ${event.path}` };
      case 'file-prepared': return { text: `${ru ? 'Изменения подготовлены' : 'Changes prepared'}: ${event.path}${event.operations ? ` · ${ru ? 'операций' : 'operations'}: ${event.operations}` : ''}` };
      case 'file-failed': return { text: `${ru ? 'Не удалось подготовить изменения' : 'Failed to prepare changes'}: ${event.path} · ${event.reason}` };
      case 'change-set-failed': return { text: `${ru ? 'Change-set не подготовлен' : 'Change-set preparation failed'}${event.path ? ` · ${event.path}` : ''}` };
      case 'commit-start': return { text: ru ? `Применяю change-set · файлов: ${event.files}` : `Applying change-set · files: ${event.files}` };
      case 'commit-finish': return { text: ru ? `Change-set применён · файлов: ${event.files}` : `Change-set applied · files: ${event.files}` };
      case 'diff-error': return { text: ru ? `${event.path} · diff не применился (${event.attempt}/${event.max}), пробую восстановить` : `${event.path} · diff failed (${event.attempt}/${event.max}), trying recovery` };
      case 'diff-recovered': return { text: ru ? `${event.path} · восстановлена на попытке ${event.attempt}` : `${event.path} · recovered on attempt ${event.attempt}` };
    }
  }
}
