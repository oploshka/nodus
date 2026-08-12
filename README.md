# Nodus Agent v0.3.0

Nodus — runtime для управляемого coding-agent, где модель не управляет всем циклом самостоятельно.
Сложность задачи по возможности выносится из модели в состояние, планирование, research-cache и ограниченные исполнители.

Текущая архитектурная гипотеза v0.3:

```text
Task → Planner
Planner ↔ Research
Planner → Execution → Result → Planner

Execution = State + Option + Worker
```

## Основные слои

### Planner

Отвечает за **что делать**: план, зависимости, критерии, recovery/replan и выбор следующей работы.
`PlannerContext` хранит состояние текущего плана, но не является хранилищем знаний о проекте.

### Research

Отвечает за **что известно о проекте**. Это прежде всего store/cache с resolver-ами:

- `ResearchStore` — project knowledge + cache фактов;
- `ResearchResolver` — выбор сохранённых знаний для текущего контекста;
- `SearchRequestCompiler` / `RetrievalResultClassifier` — уточнение отсутствующих данных через проектные источники;
- cache-факты можно инвалидировать по исходному файлу.

### Execution

Отвечает за **как выполнить уже подготовленную работу**.

Первый реальный вертикальный pipeline — изменение файла:

```text
ChangeState
→ propose-change / EditProposalWorker
→ prepare-candidate / ChangePrepareWorker
→ validate-candidate / ChangeValidationWorker
→ commit-candidate / ChangeCommitWorker
→ completed
```

Ошибочный patch не отправляет Planner обратно в общий agent-loop: retry остаётся внутри execution runtime до исчерпания локального бюджета.

## Model

`src/model` содержит adapter/controller/protocol и доступные модели capabilities. Поэтому tools теперь также находятся под `src/model/Tool`.

## Quick start

```bash
npm install
cp nodus.config.example.json nodus.config.json
npm run dev -- nodus.config.json
```

PowerShell:

```powershell
Copy-Item nodus.config.example.json nodus.config.json
```

Для локального OpenAI-compatible endpoint настройте `model.provider`, `model.endpoint` и `model.model`.

## Проверки

```bash
npm run typecheck
npm run test:unit
npm run test:integration
```

Model/e2e тесты требуют настроенный model-server.

## Статус v0.3

Это сознательно не compatibility-preserving refactor. Старые сущности ещё остаются там, где их новая ответственность пока не определена. В частности, `operation/` пока сохранён как переходный слой конфигурации model operations.

Подробнее: [`doc/ARCHITECTURE.md`](doc/ARCHITECTURE.md) и [`ROADMAP.md`](ROADMAP.md).
