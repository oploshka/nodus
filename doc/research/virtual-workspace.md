# Virtual workspace / task-wide commit

Статус: исследовательское направление, не текущая архитектура.

Сейчас Engine уже владеет физическим Edit commit: Worker возвращает semantic `ProjectEditRequest`, а `ProjectEditor` подготавливает изменения в памяти и атомарно применяет coherent edit set одного Worker result. Следующий возможный уровень ownership — не писать промежуточные успешные шаги задачи в реальный Project вообще.

## Идея

```text
Engine владеет реальным Project
  -> создаёт task Workspace / ProjectView
Worker выполняет PlanStep поверх Workspace
  -> Edit меняет виртуальное состояние
  -> последующие Worker и Research видят то же состояние
Engine
  -> после успешного завершения всей задачи
  -> проверяет и коммитит итоговый ChangeSet
```

Цель — не оставлять реальный проект в частично изменённом состоянии, если поздний PlanStep, Validation или другой terminal path завершился неуспешно.

## Базовый вариант

Первый кандидат — in-memory overlay вида `Map<ProjectPath, content>`. `.nodus/fileCache` не следует вводить заранее. Disk persistence имеет смысл только при измеримой необходимости: resume после restart, большой объём buffered data или explicit spill.

## Research

Research внутри task должен читать виртуально изменённые версии файлов. Ответ, зависящий от незакоммиченного Workspace, нельзя безусловно сохранять как persistent знание о base Project. Возможные варианты: task-local cache либо workspace identity/version.

## Открытые вопросы

- task-wide или step-wide граница транзакции;
- stale/conflict detection при внешнем изменении файлов;
- commit/rollback и temporary-file semantics;
- связь с будущим user approval;
- Validation до commit, после commit или в два этапа;
- поведение Research cache после успешного commit;
- persistence/resume долгого run.

До ответа на эти вопросы Workspace остаётся research-направлением, а не обязательной частью Engine contract.
