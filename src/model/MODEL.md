# Model layer

`model` — граница между engine и LLM/provider transport.

Engine не должен знать про OpenAI/Kobold wire response, markdown fences, parsing protocol или сериализацию входных данных.

## ModelRunner

`ModelRunner` — основная runtime-точка вызова модели.

Вызов описывает контракт, а не готовые `messages`:

```ts
model.run({
  request: {
    message: 'Choose the next action.',
    data: state,
    format: ModelRequestFormat.Json,
    guidance: 'Use only available actions.',
  },
  response: {
    format: ModelResponseFormat.Raw,
    schema: executionPlannerSchema,
  },
  settings: {
    temperature: 0.1,
    maxTokens: 1024,
  },
});
```

Смысл полей:

- `message` — что модель должна сделать;
- `data` — данные, над которыми выполняется работа;
- `request.format` — как представить `data` модели;
- `guidance` — рекомендации/ограничения по выполнению;
- `response.format` — wire-форма ответа модели;
- `response.schema` — какие данные ожидает вызывающая сторона;
- `settings` — override настроек конкретного вызова.

`settings` дополняет/переопределяет defaults из `ModelConfiguration`, а не заменяет конфигурацию provider целиком.

## Response влияет на request

Response contract двусторонний.

До вызова модели `ModelRunner` использует `response.format` и `response.schema`, чтобы добавить инструкции об ожидаемом ответе. После вызова тот же contract используется для parsing и schema decoding.

Наружу из model layer всегда возвращается JavaScript object.

## Specialized methods

Специализированные методы допустимы как тонкие facade над `run()`.

Первый реальный пример — `ModelRunner.diffFile(...)`. Он автоматически выбирает `ModelResponseFormat.Diff` и schema конкретного файла, но использует тот же transport/settings/parsing pipeline.

Пока специализированный вызов отличается только сборкой `ModelRun`, новый runner не нужен. Отдельный runner имеет смысл только если появляется другой lifecycle: tool loop, streaming, multi-turn conversation и т.п.

Отдельный `type` в `ModelRun` сейчас не добавлен: intent уже выражается вызываемым методом и/или response contract. Его стоит добавить только если появится реальная неоднозначность маршрутизации.

## Adapter

`ModelAdapter` отвечает только за provider transport. `OpenAICompatibleModelAdapter` отправляет `ModelRequest` в `/chat/completions` и возвращает raw provider response.

Adapter ничего не знает про Planner, Worker, Research, response schemas или diff application.

## Request formats

`ModelRequestFormat` отвечает только за представление `request.data` модели. Это не provider wire format.

Сейчас есть:

- `Text`;
- `Json`.

Специализированные представления данных позже могут появиться как отдельные adapters/builders, но не должны бесконечно раздувать базовый enum.

## Response formats and schemas

Формат и schema разделены намеренно.

Формат отвечает за wire representation (`Text`, `Raw`, `Json`, `Diff`). Schema описывает ожидаемые данные и преобразует уже разобранное wire value в типизированный JS object.

Подробные правила: `RESPONSE-FORMATS.md`.

## Tools

`model/Tool` содержит model capabilities: filesystem, search, git, terminal и registry.

DefaultWorker не выдаёт весь набор tools модели автоматически. Capability должна быть явно разрешена конкретным execution flow.
