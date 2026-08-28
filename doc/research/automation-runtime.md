# Automation runtime

Статус: эксперимент.

Цель прототипа — проверить идею Nodus как runtime, который исполняет настраиваемые схемы, а не как одну фиксированную цепочку `Planner -> Worker -> Edit -> Validation`.

## Разделение данных

`automation/` хранит пользовательские и версионируемые определения поведения Nodus: схемы, presets и prompts. Служебные cache/log/state данные не должны жить в этой директории.

Чистые тексты prompts хранятся отдельно в Markdown. JavaScript-файлы связывают prompts, presets и schemas.

## Process schema

Прототип использует два типа узлов:

- `sequence` — цепочка с собственным набором переменных и вложенными шагами;
- `action` — вызов Core-модуля (`worker`, `validate`, `replan` и будущих модулей).

Пример:

```js
{
  kind: 'sequence',
  id: 'code-change',
  variables: ['task', 'implementation', 'validation'],
  steps: [
    {
      kind: 'action',
      id: 'implement',
      use: 'worker',
      preset: 'code',
      input: { task: 'task' },
      saveAs: 'implementation',
    },
    {
      kind: 'action',
      id: 'validate',
      use: 'validate',
      input: { changes: 'implementation.value' },
      saveAs: 'validation',
    },
  ],
}
```

## Scope и передача результатов

Ключи переменных объявляются схемой. Action не получает весь накопленный context автоматически: `input` явно связывает поля входа с переменными процесса.

`saveAs` сохраняет полный результат модуля. Поэтому следующий action может использовать как весь результат (`validation`), так и конкретное поле (`implementation.value`).

Вложенная `sequence` получает только явно переданные значения через `input` и возвращает только явно указанные значения через `output`.

## Parent

Runtime передаёт каждому исполняемому узлу ссылку на непосредственного родителя. Это фиксирует структурную вложенность отдельно от причинных связей и data flow.

## Failure и Replan

Action может определить `onFailure`. Это controlled recovery chain, а не скрытый общий agent loop.

`Replan` рассматривается как обычный Core-модуль. В прототипе любой модуль может вернуть вложенный `process`; ожидаемый основной случай — `Replan`, который на основании ошибки формирует следующую задачу/процесс исправления.

Пока не фиксируется, насколько далеко Replan имеет право перестраивать исходную схему.

## Automation package

Папка загружается через `automation/index.js`. Entry point экспортирует definitions, а prompts указывает как отдельные `.md` файлы.

Текущий prototype package содержит:

- `schemas/code-change.js`;
- `planners/default.js`;
- `workers/code.js`;
- `responses/change-code.js`;
- `prompts/*.md`.

## Запуск прототипа

Обычная цепочка:

```bash
npm run prototype:automation -- "Prototype task"
```

Recovery через `Validate -> Replan -> repair process -> Validate`:

```bash
npm run prototype:automation -- --fail-once "Prototype task"
```

Prototype runner использует простые локальные модули без LLM и печатает итоговые variables и trace, чтобы можно было увидеть вложенность, parent links и передачу результатов.

Это ещё не замена текущему Engine/Planner pipeline. Прототип проверяет contracts загрузки, вложенных процессов, parent hierarchy, явного data flow и recovery через Replan перед интеграцией в основной runtime.

## Следующее направление

После первого prototype сформирован более простой model-facing контракт: Planner редактирует саму schema, шаги адресуются локальными номерами вместо model-generated `id`, context выбирается через `PARENT / PREVIOUS / STEP`, а Replan переписывает только невыполненный хвост. Полное описание, end-to-end failure/replan пример и TODO зафиксированы в [`process-schema-v2.md`](./process-schema-v2.md).
