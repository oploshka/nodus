# Model response formats

Этот документ фиксирует не список текущих операций, а правила проектирования model-response boundary.

## Format и schema — разные вещи

`response.format` определяет, как ответ представлен на wire-уровне модели.

`response.schema` определяет, какие данные ожидает вызывающий код.

Один и тот же смысловой результат теоретически может быть выражен разными wire-форматами. Поэтому schema не должна быть зашита в enum формата.

## Pipeline

```text
model response
-> response format handler
-> wire value
-> response schema
-> typed JS object
```

Обратное направление перед вызовом:

```text
response format + schema
-> response instructions
-> ModelRunner request
-> model
```

Именно поэтому response contract влияет на request.

## Форматы

### Text

Используется, когда ответ по смыслу является обычным текстовым значением. Даже такой ответ наружу возвращается объектом через schema, например `{ text: string }`.

### Raw

Используется для компактного schema-driven текстового protocol, когда JSON даёт лишнюю хрупкость или escaping.

`Raw` сам по себе не определяет поля конкретной операции. Их задаёт `response.schema`.

Нельзя создавать новый transport family только потому, что новой операции нужны другие поля.

### Json

Подходит для компактных структурированных ответов, когда модель стабильно генерирует JSON.

Format handler отвечает только за JSON parsing. Проверка ожидаемых полей принадлежит schema.

### Diff

Отдельный wire format для реального coding-case.

Модель возвращает обычный unified diff без `STATUS`, `ACTION`, markdown fences и других Nodus envelopes. Format handler разбирает diff в JS-структуру, schema проверяет ожидаемый target/path, а применение patch остаётся обязанностью engine.

То есть:

```text
model -> unified diff -> model layer parses -> JS diff object
engine -> PatchApplicator -> candidate/file
```

## Не создавать mini-language на каждую операцию

Новый Planner/Research/Worker action не должен автоматически порождать новый response format.

Сначала следует проверить, можно ли выразить ответ через существующий `Text`, `Raw`, `Json` или `Diff`, а различия оставить в schema.

Новый format оправдан только когда действительно меняется wire representation и его parsing semantics.

## Где заканчивается model layer

Model layer отвечает за:

- provider raw response;
- очистку/parse wire representation;
- schema decoding/validation;
- типизированный JS result.

Engine отвечает за смысловое применение результата. Например, model layer разбирает diff, но не пишет файл и не решает, считается ли задача успешно завершённой.
