# Research

`Research` — дорогая операция получения нового знания о проекте. Она не должна использоваться как универсальный способ посмотреть файл или найти символ.

Концептуальная граница:

```text
Read
  -> получить содержимое конкретного известного источника

Search
  -> найти возможные источники

Research
  -> сопоставить несколько источников и сформировать вывод / project knowledge
```

Примеры, которые не должны считаться Research:

```text
"Где находится TodoStore?"
  -> Search

"Какая сигнатура TodoStore.complete?"
  -> Search + Read

"Что сейчас находится в src/TodoStore.ts?"
  -> Read
```

Нормальный Research-вопрос требует анализа, а не простого retrieval:

```text
"Как в этом проекте принято обрабатывать отсутствие сущности на service layer?"

Research
  -> находит релевантные Store / Service / tests
  -> читает несколько источников
  -> сопоставляет поведение
  -> возвращает вывод + sources
```

## Текущее ограничение

Текущий Worker ещё не имеет bounded `Read` / `Search` requests. Поэтому исторически `Research` начал закрывать сразу retrieval, discovery и analysis. Реальные runtime-прогоны показали, что это дорого и провоцирует модели использовать Research почти для любого недостающего факта.

Пока `Read` / `Search` не добавлены в bounded Worker lifecycle, Research намеренно трактуется строже: простой путь файла, сигнатура, содержимое известного файла или другой прямой lookup не являются достаточной причиной запускать Research.

Это временно может увеличить количество `not-completed` для слабых моделей. Такой результат предпочтительнее скрытого возврата к универсальному expensive Research и позволит отдельно измерить эффект будущих `Read` / `Search` capabilities.

## Желаемый lifecycle

```ts
Worker(step) {
  result = Action.run()

  // дешёвые bounded data requests
  Read / Search

  result = Action.run(data)

  // дорогая эскалация только когда нужен вывод по нескольким источникам
  Research.run(question)

  result = Action.run(data, knowledge)
  Edit.run(result)
}
```

`Read` должен читать task-local состояние через `Edit`, чтобы последующие steps видели накопленные изменения. `Search` сначала может использовать физический project index, но найденный source перед использованием должен читаться через task-local `Edit`.

## Knowledge и cache

Research-result имеет смысл кешировать, когда это действительно синтезированное project knowledge, а не копия факта из одного файла.

Текущий cache основан на raw question + source hashes. В будущем Research-вопрос может сначала проходить qualification, например:

```text
project-standard / missing-entity
project-standard / error-handling
architecture / runtime-configuration
```

Тогда несколько формулировок одного вопроса смогут ссылаться на одно project knowledge. Также qualification создаёт естественную точку, где Nodus сможет предложить пользователю ответить самому вместо дорогого исследования проекта.

## Отдельные незакрытые проблемы

Research не должен автоматически разрешать любую неоднозначность. Если несколько релевантных источников показывают противоречащие conventions, это может быть отдельный `decision / clarification` case, а не повод бесконечно расширять Research.

Также остаются связанные Worker-проблемы:

- `already-completed`: следующий PlanStep может повторно создать edit для результата, уже накопленного предыдущим step;
- границы PlanStep: Worker иногда изменяет сущности, относящиеся к последующим steps;
- model-call isolation: нужно отдельно подтвердить, что каждый bounded model call получает только ожидаемые messages и не наследует неожиданную conversation/session history.
