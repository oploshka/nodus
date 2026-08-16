# Model response formats

Этот документ фиксирует правила model-response boundary, а не список текущих операций.

## Format и schema — разные вещи

`response.format` определяет, как ответ представлен на wire-уровне модели.

`response.schema` единообразно определяет объект, который ожидает вызывающий код.

Schema не меняется только потому, что меняется wire format. Все форматы в итоге должны дать object, который проходит одну общую schema validation.

## Pipeline

```text
response schema + response format
-> response instructions
-> model request
-> model
-> wire response
-> response format handler
-> intermediate representation
-> common schema normalization/validation
-> ModelRunResult.data
```

## Common object schema

Root всегда является object. Вызов обычно задаёт только `fields`:

```ts
schema: {
  fields: {
    status: {
      type: 'option',
      description: 'Result state.',
      optionList: [
        { id: 'completed', description: 'Work is finished.' },
        { id: 'failed', description: 'Work cannot be finished.' },
      ],
    },
    summary: {
      type: 'string',
      optional: true,
    },
  },
}
```

Поддерживаемые field types пока намеренно малы: `string`, `number`, `boolean`, `option`, `object`, `array`, `any`.

Не добавлять regex/min/max/union/nullable/transform, пока для этого нет реального кейса.

## Форматы

### Text

Используется, когда модель по смыслу возвращает одно текстовое значение.

Format handler превращает текст в object вида `{ text: string }`, после чего применяется та же common schema.

### Raw

Универсальный компактный FIELD-value формат:

```text
status completed
summary Change prepared
```

Raw handler знает только общий синтаксис `field value`. Он не знает Planner/Worker/Research semantics и не решает cardinality поля. Каждое встреченное значение сначала сохраняется как occurrence:

```text
status completed
files src/A.ts
files src/B.ts
```

```ts
{
  status: ['completed'],
  files: ['src/A.ts', 'src/B.ts'],
}
```

Далее common schema нормализует representation согласно ожидаемому типу: scalar получает одно значение, array получает все occurrences, number/boolean/option приводятся и проверяются.

Для object в первом приближении используется JSON одного объекта на той же строке:

```text
input {"path":"src/Cli/Cli.ts"}
edits {"path":"src/A.ts","instruction":"Change A"}
edits {"path":"src/B.ts","instruction":"Change B"}
```

Если schema ожидает `array<object>`, repeated `edits` становятся массивом объектов на этапе schema normalization. Модели не нужно сериализовать root JSON object или JSON array для repeated Raw fields.

Operation-specific mini-language внутри Raw запрещён.

### Json

Подходит для компактных структурированных ответов.

Format handler занимается только JSON parsing. Все ожидаемые поля/options проверяет common schema.

### Diff

Отдельный wire format для unified diff.

Модель возвращает обычный unified diff без `STATUS`, `ACTION`, markdown wrapper и других Nodus envelopes. Diff handler разбирает его в JS object; затем применяется та же common schema. Применение patch остаётся обязанностью engine.

```text
model -> unified diff -> DiffResponseFormatHandler -> JS object -> schema
engine -> PatchApplicator -> file
```

## Не создавать mini-language на каждую операцию

Новый Planner/Research/Worker action не должен автоматически порождать новый response format или schema class.

Сначала следует проверить, можно ли выразить результат через существующий `Text`, `Raw`, `Json` или `Diff` + common object schema.

Новый format оправдан только когда реально меняется wire representation и parsing semantics.

## Ошибки

Различаются как минимум две границы:

- `ModelResponseFormatError` — wire response невозможно разобрать выбранным format handler;
- `ModelResponseSchemaError` — wire response разобран, но object не соответствует ожидаемой common schema.

Это различие полезно для будущих retry/recovery policy, но не требует разных schema API.
