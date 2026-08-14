# Архитектурная эволюция: рабочие гипотезы

Этот документ сохраняет направления, возникшие при разборе истории Nodus, но ещё не являющиеся текущей архитектурой. Он нужен, чтобы полезные ранние идеи не потерялись при переписывании runtime.

## Project Understanding как first-class проблема

Одна из исходных идей Nodus: модели недостаточно видеть только файлы текущей задачи. В зрелом проекте важны локальные правила — почему архитектура устроена именно так, какие решения уже существуют, какие исключения приняты и как в проекте обычно решаются похожие задачи.

Это особенно заметно на задачах, где внешне простой запрос опирается на глубокие project-specific conventions: custom form handling, собственные поля, наследование, правила хранения данных и другие решения, которые модель легко начинает изобретать заново.

Гипотеза: Nodus со временем должен не просто искать файлы, а уметь доставлять исполнителю релевантную project expertise.

## Task classification и task-specific expertise

Возможное направление — отдельный classifier до основной orchestration. Его задача не заменять Planner. Planner декомпозирует конкретную пользовательскую задачу на semantic outcomes; classifier отвечает на другой вопрос: к какому типу относится задача и какие знания/constraints/prompt context полезны именно для этого типа.

Условный результат classifier может говорить: задача связана с формами; для неё нужны знания о form handler, field hierarchy и storage conventions. Worker получает не «тонну project prompt целиком», а выбранный набор expertise.

Classifier потенциально может также различать простые задачи. Это не обязательно означает нулевой overhead: дополнительная классификация и проверки стоят model call/time, но могут покупать предсказуемость. Нужны измерения, прежде чем превращать это в runtime contract.

## Prompt, policy, examples и context — не одно и то же

В ранних концептах эти виды input намеренно разделялись:

- Prompt/Profile — как выполнять данный класс semantic operation;
- Project Policy — какое ограничение или предпочтение действует в этом проекте;
- Pattern/Example — как похожая задача уже решена здесь;
- Context — конкретные данные, нужные этому вызову;
- Model Profile — особенности общения с конкретной моделью.

Сам набор ранних `OperationProfile / PolicyResolver / PatternResolver / ContextSelector` не следует возвращать автоматически. Но различие полезно сохранить: task-specific prompt не должен подменять project knowledge, а длинная project policy не должна подменять хорошие canonical examples.

Практическая гипотеза — собирать effective Worker context из нескольких небольших источников, выбранных под задачу, а не поддерживать один глобальный system prompt «про весь проект».

## Capability зависит от модели

Одна и та же task classification не гарантирует одинакового execution path для разных моделей. То, что можно безопасно считать простой задачей для одной модели, может требовать более узких contracts, Research или другой Edit strategy для другой.

Поэтому в будущем возможна связь:

```text
task classification
+ project expertise
+ measured model capabilities
-> execution policy
```

Classifier при этом описывает саму задачу, а не должен знать конкретный список моделей пользователя. Capability profile — отдельный input будущей execution policy.

Model-capability benchmark уже может давать локальные данные о способности выражать edits; task classifier и project expertise пока остаются отдельными гипотезами.

## Knowledge lifecycle, а не просто cache

Ранний Project Knowledge предполагал более богатую semantics, чем текущий Research cache. В частности, обсуждалась идея `KnowledgeCandidate`: observation, successful change, Verification result или human answer сначала являются только кандидатом на сохранение, а не новым project fact.

Особенно полезны несколько различий:

- `execution` scope против `project` scope;
- Observed knowledge против Declared knowledge;
- code хорошо подтверждает **WHAT**, но не всегда может доказать **WHY**;
- confidence/source должны отражать происхождение знания, а не создавать псевдоматематическую уверенность;
- разные типы знания требуют разной invalidation semantics;
- повторяющиеся observations могут со временем promotion'иться в Pattern.

Пример проблемы: ответ пользователя на ambiguity может быть правилом всего проекта, а может быть решением только текущей Task. Автоматически сохранять его навечно опасно.

Это далёкое направление. Текущий source-hash Research cache остаётся правильной простой реализацией для bounded answers. Более широкий Knowledge lifecycle стоит возвращать только при появлении повторяющейся необходимости сохранять знания между задачами.

## Transient context не равен Project Knowledge

Раннее обсуждение IDE boundary отделяло active file, selection, open files, cursor и recent files от долговременного Knowledge. Это transient user context: хороший сигнал для выбора релевантной информации, но плохой кандидат на сохранение как факт проекта.

Даже без IDE это различие полезно сохранить на будущее:

```text
persistent project knowledge
!=
task execution state
!=
transient user/session context
```

Virtual workspace добавляет четвёртый тип состояния — uncommitted project view конкретной Task.

## Project Policy и Execution Policy

В ранней истории явно разделялись два разных вида ограничений.

Project Policy отвечает на вопросы вроде: «предпочитай существующий EntityManager», «следуй текущему form lifecycle».

Execution Policy отвечает на управление риском и runtime: можно ли писать/удалять файлы, требуется ли approval, сколько model calls допустимо, обязательна ли Verification, сколько файлов можно менять за один run.

Современный Nodus частично содержит execution limits/write policy и отдельно обсуждает project-specific expertise. Эти две линии не стоит смешивать в будущем classifier/context system.

## Verification failure как отдельное решение

Ранняя схема уже отмечала опасность бесконечного `test failed -> ask model to fix -> repeat`. Вместо этого Verification result должен позволять runtime выбрать разный следующий ход: technical fix, semantic retry, replan, rollback, ask human или stop.

Текущий Validation skeleton ещё не решает эту задачу. При проектировании Validation v2 полезно сохранить саму taxonomy проблемы, не обязательно ранние классы или flow.

## Human boundary

Человек в ранних концептах находился над runtime, а не внутри tool list модели. Причины взаимодействия различались: clarification, approval, choice, conflict, risk, knowledge confirmation.

Это хорошо совпадает с современным направлением Engine interaction/control points. В будущем важно не свести все случаи к одному generic `ask user`: причина ожидания влияет на resume semantics и на то, можно ли использовать ответ как Project Knowledge.

## Capability-gap logging

Была также более далёкая идея: если системе регулярно не хватает определённого интеллектуального способа работы, не обязательно сразу проектировать новый класс. Можно сначала логировать capability gaps и смотреть реальные повторения: например, `compare-implementations`, `inspect-lifecycle`, `analyze-data-flow`.

Тогда расширение prompt/profile или новая deterministic capability появляется из накопленных случаев, а не из предварительного архитектурного списка. Самоавтоматическое изменение runtime кода рассматривалось только с human approval и сейчас не является направлением разработки.

Эта идея хорошо сочетается с текущим правилом «новые Actions — только по реальным задачам» и execution samples, но пока не требует отдельного механизма.

## Почему не фиксировать готовое решение сейчас

Проблемы Project Understanding, knowledge lifetime, task classification и capability-aware execution выглядят устойчивыми, но конкретные storage/index/classifier/profile designs ещё не проверены.

Раннее создание сложной knowledge architecture может снова привести к системе, построенной раньше реальных требований. Следующий полезный шаг — сохранять реальные случаи, где обычного Research или текущего Worker context недостаточно, и по ним выделять повторяющиеся классы expertise, state и execution policy.
