# Model scope guidance

`src/model/` отвечает за model/provider boundary: transport, request/response contracts, response parsing и выполнение model calls. Для provider-specific или format-specific задачи оставайся внутри Model, пока публичный contract не требует изменений у consumers.

## Правила scope

- `Adapter/` держи transport-focused: endpoint, HTTP/provider behavior и преобразование wire format.
- `Request/` и `Response/` владеют model-facing formats/contracts; не протаскивай туда Engine lifecycle semantics без необходимости.
- `Runner/` связывает transport и model execution behavior. Если меняется только provider error/reporting, не расширяй задачу в Engine/automation автоматически.
- Не исследуй `automation/` для локальной Adapter/Response-задачи, если direct consumer contract не меняется.
- При изменении exported request/response/runner contract найди его прямых consumers и обнови только затронутые focused tests.
- Provider-specific детали не должны диктовать архитектуру Engine.

Начинай с соответствующего файла и `test/unit/model/`. Архитектурные документы нужны только если изменение меняет саму model/runtime boundary, а не её внутреннюю реализацию.
