# Model layer

`model` — граница между engine и LLM/provider transport.

Engine не должен знать про OpenAI/Kobold wire response, markdown fences, parsing protocol или сериализацию входных данных.

## ModelRunner

`ModelRunner` — основная runtime-точка вызова модели.

Вызов описывает application-level contract:

```ts
model.run({
  request: {
    message: 'Choose the next action.',
    data: state,
    format: ModelRequestFormat.Json,
    guidance: 'Use only available actions.',
  },
  response: {
    format: ModelResponseFormat.Json,
    schema: {
      fields: {
        status: {
          type: 'option',
          optionList: [
            { id: 'action', description: 'Run an available action.' },
            { id: 'completed', description: 'The work is complete.' },
          ],
        },
      },
    },
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
- `response.schema` — единая object-schema ожидаемого JS результата;
- `settings` — override настроек конкретного вызова.

`settings` дополняет/переопределяет defaults из `ModelConfiguration`, а не заменяет provider configuration целиком.

## Единая response schema

Schema не делится на `PlannerSchema`, `DiffSchema`, `ResearchSchema` и другие operation-specific классы.

Корневой результат всегда object. Поэтому `type: 'object'` у root является неявным, а вызывающий код обычно задаёт только `fields`.

Базовые field types:

- `string`;
- `number`;
- `boolean`;
- `option` + `optionList`;
- `object`;
- `array`;
- `any` — только когда structure уже безопасно разобрана format handler'ом или действительно не важна этому boundary.

`option` предпочтительнее технического `enum`, потому что каждый вариант может содержать описание того, когда модель должна его выбирать.

Schema одновременно:

1. участвует в формировании инструкции модели;
2. проверяет parsed object;
3. нормализует простые wire values в ожидаемые JS значения.

Schema не должна знать особенности конкретного provider transport.

## ModelRunResult

`ModelRunner.run()` возвращает богатый диагностический объект:

```ts
{
  data: { ... },
  exchange: {
    request: [
      { role: 'system', message: '...' },
      { role: 'user', message: '...' },
    ],
    response: [
      { role: 'assistant', message: '...' },
    ],
  },
  meta: {
    model: '...',
    temperature: 0,
    maxTokens: 1024,
    durationMs: 1234,
    promptTokens: 100,
    completionTokens: 20,
    totalTokens: 120,
    finishReason: 'stop',
  },
}
```

- `data` — единственная часть, которая обычно нужна Planner/Research/Worker;
- `exchange` — нормализованный фактический обмен с моделью для логов/debug;
- `meta` — технические параметры и метрики запуска.

`exchange` намеренно не хранит provider-specific request object целиком. Он сохраняет важный логический обмен `role + message`, а transport details остаются внутри Adapter.

## ModelCaller

`Runner/ModelCaller.ts` содержит маленькие функции `callModel`/`callDiffFile`.

Они:

1. вызывают `ModelRunner`;
2. логируют полный `ModelRunResult`;
3. возвращают наружу только `result.data`.

Это защита границы: обычный engine step не получает `exchange/meta` и не начинает зависеть от диагностической информации.

`ModelCaller` намеренно является функцией, а не классом. Logger передаётся явно; эта простая зависимость не является частью логики `ModelRunner`.

## Response влияет на request

Response contract двусторонний.

До вызова модели `ModelRunner` использует `response.format` и `response.schema`, чтобы добавить инструкции об ожидаемом ответе. После вызова format handler разбирает wire representation, а та же единая schema проверяет объект.

Наружу из model layer всегда возвращается JavaScript object.

## Specialized methods

Специализированные методы допустимы как тонкие facade над `run()`.

Первый реальный пример — `ModelRunner.diffFile(...)`. Он автоматически выбирает `ModelResponseFormat.Diff`, использует ту же общую schema infrastructure и дополнительно проверяет ожидаемый target path.

Пока специализированный вызов отличается только сборкой `ModelRun`, новый runner не нужен. Отдельный runner имеет смысл только если появляется другой lifecycle: tool loop, streaming, multi-turn conversation и т.п.

Отдельный `type` в `ModelRun` сейчас не добавлен: intent выражается вызываемым методом и/или request/response contract. Его стоит добавить только при реальной неоднозначности маршрутизации.

## Adapter

`ModelAdapter` отвечает только за provider transport. `OpenAICompatibleModelAdapter` отправляет `ModelRequest` в `/chat/completions` и возвращает минимальный raw provider response: content, usage и finish reason.

Adapter ничего не знает про Planner, Worker, Research, response schemas или diff application.

## Request formats

`ModelRequestFormat` отвечает только за представление `request.data` модели. Это не provider wire format.

Сейчас есть:

- `Text`;
- `Json`.

Специализированные представления данных позже могут появиться как отдельные adapters/builders или специализированные `ModelRunner` methods. Базовый enum не должен раздуваться operation-specific значениями.

## Tools

`model/Tool` содержит model capabilities: filesystem, search, git, terminal и registry.

Worker не выдаёт весь набор tools модели автоматически. Capability должна быть явно разрешена конкретному execution flow.

## Language boundary

Model calls may receive user tasks in any language. Engine-side callers currently provide language hints so internal Nodus structures can stay in a stable machine-facing language while user-facing summaries and project-authored text use their configured languages. The model transport itself does not own this policy.
