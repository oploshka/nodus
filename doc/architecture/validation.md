# Validation

Validation — Engine-owned граница между результатом выполнения шага и окончательным `completed` для этого шага.

В 0.4 Validation перешла от чистого `PassValidator` skeleton к первому реальному, намеренно простому набору checks. Текущая цель — получить живой lifecycle и реальные failure cases, а не заранее построить универсальный validation framework.

Текущий поток:

```text
Worker
  -> semantic result / edit intent
Engine
  -> Edit prepare + commit
  -> Validation
       -> JSON syntax check для изменённых .json
       -> user-configured command checks
  -> completed PlanStep
       или not-completed
```

## Контракт

`ValidationContext` получает:

- `Task`;
- текущий `PlanStep`;
- completed `WorkerResult`;
- canonical project-relative paths, реально записанные Engine-owned Edit.

Каждый `ValidationCheck` возвращает отдельный результат:

- `passed`;
- `skipped`;
- `failed`;

с `id`, duration и optional diagnostic details. `CompositeValidator` запускает все configured checks последовательно и агрегирует failures в общий `ValidationResult`.

`PassValidator` оставлен как явная compatibility/test implementation, но обычный Bootstrap теперь использует `CompositeValidator`.

## Текущие checks

### JSON

`JsonValidationCheck` включён по умолчанию и парсит только `.json` файлы, которые действительно были изменены текущим step. Это дешёвая deterministic проверка и первый пример validator, которому нужны реальные changed paths после Edit.

Отключается через:

```json
{
  "validation": {
    "json": false
  }
}
```

### Command

`CommandValidationCheck` запускает trusted command из пользовательской configuration внутри project root. Nodus не пытается самостоятельно угадывать package manager, typecheck command или test runner.

Пример:

```json
{
  "validation": {
    "commands": [
      {
        "id": "typecheck",
        "command": "npm run typecheck",
        "timeoutMs": 120000
      },
      {
        "id": "tests",
        "command": "npm test"
      }
    ]
  }
}
```

По умолчанию command check запускается только если step изменил файлы. `when: "always"` позволяет запускать его и для completed steps без Edit.

Todo dogfooding config сейчас включает `typecheck` и `tests`, чтобы следующий живой прогон дал реальные данные о поведении Validation.

## Что намеренно пока не решено

Текущая Validation является **post-commit**. Если check не прошёл, Engine превращает результат step в `not-completed`, но уже записанные файлы автоматически не откатываются.

Это сознательно оставленная проблема, а не финальная semantics. Следующие вопросы должны решаться после живых прогонов:

- нужен ли pre-commit validation поверх prepared/virtual state;
- нужен ли rollback при post-commit failure;
- какие failures можно отправлять Worker на semantic recovery, а какие являются terminal;
- должны ли разные checks быть blocking/non-blocking;
- как выбирать subset checks по task/change profile, а не запускать всё после каждого изменения;
- нужны ли built-in typecheck/test/config validators или достаточно command abstraction;
- как Validation работает поверх будущего Virtual Workspace;
- какие diagnostics показывать пользователю, а какие оставлять только в file log;
- как включить validation runs/failures/duration в task statistics.

Пока принцип простой: несколько дешёвых deterministic checks, явный failure и максимум наблюдаемости без скрытых model calls.
