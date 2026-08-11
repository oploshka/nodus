# Стратегия тестирования

Тесты разделены по стоимости и по тому, участвует ли реальная модель.

## Группы

- `test/unit/` — быстрые детерминированные контракты без модели.
- `test/integration/` — несколько компонентов Nodus и границы workflow без реальной LLM.
- `test/model/step/` — один конкретный шаг с реальной моделью и фиксированным входом.
- `test/model/chain/` — реальный проход нескольких шагов с той же схемой ожиданий; позволяет проверить, что предыдущие шаги действительно сформировали правильный вход для следующего.
- `test/e2e/` — полный Nodus + реальная модель + проект. Самая дорогая группа.

## Команды

```bash
npm test                  # unit + integration, без модели
npm run test:unit
npm run test:integration
npm run test:model        # model-step + model-chain
npm run test:model:step
npm run test:model:chain
npm run test:e2e
npm run test:all          # typecheck + всё остальное
```

Для model-тестов по умолчанию используется `nodus.config.json`. Другой конфиг можно передать через `NODUS_TEST_CONFIG`.

## Data-driven сценарии модели

Правильное поведение сценария описывается данными в `test/model/scenario/*.schema.ts`. В схеме фиксируются канонический план, правильный вход перед каждым изолированным шагом и ожидаемый контракт результата.

Тестовая логика общая:

```ts
await testStep(statusModelScenario, 5);
await testChain(statusModelScenario, 1, 5);
```

`testStep` запускает один шаг на эталонном входе. Это локализует ошибку самого шага.

`testChain` реально выполняет диапазон шагов подряд. Поэтому если шаги 1–4 сформировали не тот state, это проявится на проверке шага 5. Оба режима используют одну и ту же схему ожидаемых данных.

Проверяется не дословный текст ответа модели, а структурные свойства: outputs, retrieval match, resolved/missing facts, обязательные и запрещённые API/действия, наличие model/tool calls и предлагаемый diff.

Edit-stage в model-step/chain перехватывает изменения и не записывает их в production-файлы.

## E2E `/status`

Пока канонический полный прогон остаётся ручным:

```bash
npm run dev -- nodus.config.json --clear-cache --clear-logs --scan --scenario=status
```

E2E не входит в обычный `npm test`, чтобы локальная модель не запускалась при каждом изменении.


## Сценарий `/status`

```bash
npm run test:model:status:step   # каждый из 8 шагов отдельно
npm run test:model:status:chain  # реальные цепочки 1..5 и 5..6
npm run test:model:status        # оба режима
```

Схема: `test/model/scenario/status.schema.ts`.
