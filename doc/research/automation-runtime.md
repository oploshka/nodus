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

Это ещё не замена текущему Engine/Planner pipeline. Прототип проверяет contracts загрузки, вложенных процессов, parent hierarchy, явного data flow и recovery через Replan перед интеграцией в основной runtime.
