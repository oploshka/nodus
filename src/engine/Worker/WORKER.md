# Worker

Worker выполняет один `PlanStep` и скрывает локальный execution process от Engine.

Engine видит только:

- `completed`;
- `not-completed` + `canContinue`;
- `failed`.

Worker — процесс с непредсказуемым итогом. Он может успешно решить задачу, исчерпать budget или столкнуться с terminal constraint.

## Actions

Worker владеет bounded списком executable Actions. Action — capability с конкретным input/output contract, а не объект, который нужно «превратить в prompt» снаружи.

Текущий `CodeWorker`:

```text
CodeWorker
  change-code
  research
```

Нормальный цикл:

```text
ChangeCodeAction.run(step, knowledge)
  -> completed
  -> failed
  -> not-completed + research requests

ResearchAction.run(question)
  -> bounded Research answer

ChangeCodeAction.run(step, updated knowledge)
  -> retry execution
```

Research не запускается заранее. Primary Action сначала пытается выполнить задачу и только потом явно сообщает, каких concrete facts не хватает.

## Action responsibilities

`ChangeCodeAction` отвечает за coherent project change. Один Action может менять несколько файлов, если все edits нужны для одного outcome. Внутри Action находятся его model guidance/prompt, proposal/edit contract, diff generation, patch apply и local recovery конкретного edit.

Action может использовать `ModelCaller`/`ModelRunner` и per-call model settings. Он не должен знать provider-specific HTTP/wire details.

`ResearchAction` оборачивает Research service и возвращает его локальный результат Worker.

Новые Actions (`RunCommandAction`, documentation и т.п.) не вводятся заранее — только когда capability становится отдельным повторяемым contract.

## Project paths

Project file references считаются untrusted model input. Каноническая форма внутри engine — path relative to project root с `/` separators.

`ProjectPathResolver`:

- принимает decorated/absolute/file URL references и приводит их к project-relative path;
- запрещает выход за project root;
- для existing operations проверяет реальное существование файла;
- может исправить неверный prefix через project index только при одном однозначном match;
- для create target требует безопасный existing parent;
- блокирует writes в `node_modules`, `.git` и project excludes.

`.nodus` сейчас временно исключён из write-policy enforcement, потому что Research cache/index всё ещё сохраняются через общий Project write API. Это не целевая security policy: planned internal-storage boundary должен снова сделать `.nodus` недоступным model Actions.
