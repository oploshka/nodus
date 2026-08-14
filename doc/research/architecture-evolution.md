# Архитектурная эволюция: рабочие гипотезы

**Статус:** рабочий research-документ; описанные направления не являются текущим runtime contract.

Этот документ сохраняет направления, возникшие при разборе истории Nodus, но ещё не являющиеся текущей архитектурой. Он нужен, чтобы полезные ранние идеи не потерялись при переписывании runtime.

## Project understanding как first-class проблема

Одна из исходных идей Nodus: модели недостаточно видеть только файлы текущей задачи. В зрелом проекте важны локальные правила — почему архитектура устроена именно так, какие решения уже существуют, какие исключения приняты и как в проекте обычно решаются похожие задачи.

Это особенно заметно на задачах, где внешне простой запрос опирается на глубокие project-specific conventions: custom form handling, собственные поля, наследование, правила хранения данных и другие решения, которые модель легко начинает изобретать заново.

Гипотеза: Nodus со временем должен не просто искать файлы, а уметь доставлять исполнителю релевантную project expertise.

## Task classification и task-specific expertise

Возможное направление — отдельный classifier до основной orchestration. Его задача не заменять Planner. Planner декомпозирует конкретную пользовательскую задачу на semantic outcomes; classifier отвечает на другой вопрос: к какому типу относится задача и какие знания/constraints/prompt context полезны именно для этого типа.

Условный результат classifier может говорить: задача связана с формами; для неё нужны знания о form handler, field hierarchy и storage conventions. Worker получает не «тонну project prompt целиком», а выбранный набор expertise.

Classifier потенциально может также различать простые задачи. Это не обязательно означает нулевой overhead: дополнительная классификация и проверки стоят model call/time, но могут покупать предсказуемость. Нужны измерения, прежде чем превращать это в runtime contract.

## Capability зависит от модели

Одна и та же task classification не гарантирует одинакового execution path для разных моделей. То, что можно безопасно считать простой задачей для более сильной модели, может требовать более узких contracts, Research или другой Edit strategy для меньшей/квантованной модели.

Поэтому в будущем возможна связь:

```text
task classification
+ project expertise
+ measured model capabilities
-> execution policy
```

Но эти слои не следует преждевременно смешивать. Model-capability benchmark уже может давать локальные данные о способности выражать edits; classifier и project expertise пока остаются отдельными гипотезами.

## Knowledge lifetime и promotion

Ранняя архитектура различала observation и знание. Human answer, успешное изменение, Verification result или observation модели не обязаны автоматически становиться persistent Project Knowledge.

Полезная долгосрочная гипотеза — промежуточный `KnowledgeCandidate` с provenance, scope, confidence и возможным review/promotion. Отдельно важно различать:

- **Observed** — что можно достаточно уверенно вывести из текущего кода/состояния Project;
- **Declared** — архитектурное `why`, policy или намерение, которое часто требует документации или человека.

Эта taxonomy пока не означает необходимость отдельной Knowledge subsystem. Она сохраняет проблему качества и lifetime знания, если Project Understanding вернётся в runtime.

## Persistent knowledge, task state и transient context

Ранние версии смешивали project knowledge, execution/task state и историю в одном state. Позже стало понятно, что это разные lifetime.

Дополнительно transient user/session context — active file, selection, open files, UI context — может быть полезным сигналом для текущей задачи, но не должен автоматически становиться persistent Project Knowledge.

Будущий Virtual Workspace добавляет ещё один lifetime: виртуальное состояние Project внутри Task. Эти категории желательно не смешивать даже если конкретные storage abstractions пока не определены.

## Project Policy и Execution Policy

Project-specific правило и runtime control rule — разные типы знания.

`Используй существующий EntityManager` относится к Project Policy. `Удаление требует approval`, `max model calls` или `validation required` относятся к Execution Policy/runtime control.

Будущий classifier/project expertise не должен незаметно становиться единственным policy engine для обеих задач.

## Validation failure semantics

Ранняя Verification-гипотеза уже отмечала, что `validation failed -> снова попросить модель исправить` — не универсальная recovery strategy. В зависимости от failure class возможны fix, rollback, adjust plan, ask human или stop.

Проверки также могут отличаться по природе: deterministic static/behavioral checks и более сложный review requested scope/project policy/architecture consistency. Validation v2 должен начинаться с реальных validators и failure cases, но полезно не потерять это различие.

## Human control boundary

Clarification, approval, conflict, risk и knowledge confirmation исторически рассматривались как отдельная Human boundary, а не как ещё один tool модели. Текущий Engine interaction API пока не реализован, но эта проблема не является новой feature-идеей — она осталась нерешённой после ранних архитектурных версий.

## Capability-gap logging

Если Nodus регулярно не хватает некоторой операции или expertise, не обязательно сразу создавать новый Action/subsystem. Возможный подход — фиксировать повторяющиеся capability gaps и различать случаи, где достаточно prompt/profile/context change, от случаев, где действительно нужен новый deterministic tool или runtime contract.

Это хорошо сочетается с execution samples и правилом добавлять Actions только из подтверждённых задач.

## Почему не фиксировать готовое решение сейчас

Проблема Project Understanding выглядит устойчивой, но конкретный storage/index/classifier design ещё не проверен. Раннее создание сложной knowledge architecture может снова привести к системе, построенной раньше реальных требований. Следующий полезный шаг — сохранять реальные случаи, где обычного Research недостаточно, и по ним выделять повторяющиеся классы expertise.
