# Эволюция проекта

Этот документ хранит короткую историю архитектурных переходов Nodus. Причины появления проекта и исходные вопросы вынесены в [`origin.md`](origin.md). Здесь фиксируется именно то, как эти вопросы постепенно привели к текущему runtime.

Документ не заменяет текущую архитектурную документацию и не пытается перечислить каждый bugfix.

## От концепта к управляемому runtime

Ранние концепты Nodus уделяли много внимания Project Understanding: накопленному знанию о существующем проекте, task-specific Context, Policies, Patterns и Examples. Параллельно исследовалась другая проблема — сколько ответственности стоит оставлять свободному agent loop, а сколько можно сделать явной частью runtime.

По мере реальных прогонов вторая линия стала основной областью практической разработки. Вместо попытки сразу построить полноценную систему Project Intelligence проект начал последовательно уточнять execution boundaries: planning, получение недостающей информации, Worker lifecycle, edit mechanics, state ownership и validation.

Это не означает отказ от Project Understanding. Эта линия была отложена и сейчас сохраняется как отдельная открытая область исследования.

## Разделение состояний

Одна из ранних проблем старых прототипов — слишком много разных смыслов было собрано в одном `state`: project index, dependency information, style hints, план, выполненные шаги, изменённые файлы и история предыдущих попыток.

Позже стало понятнее, что здесь смешивались как минимум три разных типа состояния:

- долгоживущее знание/состояние Project;
- временное состояние одной Task/Execution;
- execution history и наблюдения о конкретной попытке.

Современная архитектура не воспроизводит эту схему буквально, но само разделение пережило rewrite: Project/Research cache, Worker state, Engine lifecycle и execution statistics имеют разный lifetime и ownership. Будущий virtual workspace снова делает эту границу важной, потому что появляется ещё одно состояние — виртуальная версия Project внутри незавершённой Task.

## Requirement era

Следующей попыткой формализовать uncertainty стала requirement-driven архитектура. Она различала `exact / related / missing`, не позволяла `related` evidence удовлетворять requirement и повторно проверяла исходный requirement после получения новых данных.

Эта система сохраняла полезную семантику — найденное предположение не равно подтверждённому факту, — но постепенно начала описывать внутреннюю механику Nodus через слишком подробные execution steps. Requirement graph, PlanExecutor, recovery и специализированные stages стали диктовать форму решения вместо того, чтобы помогать semantic task decomposition.

После rewrite machinery была удалена, но часть смысла сохранилась в более простой форме: Worker может сообщить concrete missing information, Research получает bounded answer, после чего Worker продолжает попытку. Историческая идея evidence/uncertainty пережила конкретную Requirement architecture.

## Поиск подходящей runtime entity

Между Requirement architecture и современным Worker существовали несколько промежуточных моделей: `Workflow/Stage`, `Planner/Research/Cube`, `State -> Option -> Worker`, `ExecutionPlanner + Actions`, Worker как handler типа PlanStep.

Большинство этих вариантов были разумны локально, но на реальных сценариях смешивали близкие ответственности. В частности, Research как отдельный обязательный PlanStep снова заставлял Planner описывать внутренний алгоритм Nodus, а `ExecutionPlanner`, `Option`, `Action` и `Worker` начали частично дублировать друг друга.

Современный Worker появился после упрощения контракта до наблюдаемого поведения: попытаться выполнить semantic step и вернуть `completed`, `not-completed` или `failed`, при необходимости запрашивая Research внутри своего execution loop.

`Determine` вырос отдельно из более узкой проблемы выбора Worker: bounded selection оказалось полезной операцией само по себе и не потребовало отдельной Worker-specific сущности.

## Edit как серия boundary shifts

Edit прошёл несколько независимых экспериментов: full-file edit, unified diff, exact replace и range-replace. Эти прогоны показали, что нужно разделять как минимум три разных failure class:

- модель неправильно поняла semantic изменение;
- модель поняла изменение, но плохо выразила его в конкретном edit contract;
- runtime/parser/applicator неправильно обработал или диагностировал model output.

Из-за этого raw `correct/incorrect` benchmark оказался недостаточным: byte-for-byte expected output мог помечать функционально корректную реализацию как failure, а malformed diff мог содержать правильный semantic intent.

Следующим шагом появился buffered ChangeSet: все edits coherent result готовятся в памяти и только после полной подготовки могут менять Project. Это закрыло partial mutation внутри одного result.

Затем техническая materialization была вынесена из Worker в Engine-owned Edit. Worker сообщает semantic intent, а `ProjectEditor` владеет authoritative source, strategy, recovery/fallback, buffering и commit. Так capability planning, edit serialization и applicator behavior стало возможно наблюдать и улучшать отдельно.

## Validation и recovery

Verification присутствовал ещё в ранних концептах и предполагался шире обычного `npm test`: static checks, behavioral tests и review уровня diff/policy/scope/architecture. При failure ранняя идея уже предлагала не слепой `fix -> retry`, а отдельное решение: fix, rollback, replan, ask human или stop.

Современный Validation пока вернулся только как минимальная lifecycle boundary с `PassValidator`. Поэтому Validation v2 — не совершенно новая идея, а более приземлённое возвращение старой проблемы поверх уже существующего Engine/Edit ownership.

## Human/control boundary

В ранних схемах человек не считался Tool модели. Для clarification, approval, conflict, risk и knowledge confirmation предполагалась отдельная waiting/resume boundary. Позже похожая идея снова появилась в Engine как будущие interaction/control points.

Это ещё один пример идеи, которая пережила несколько архитектур, но пока не получила окончательный runtime contract.

## Архитектурные переходы 0.3

В ходе 0.3 spike закрепились верхние слои `app / engine / model`, semantic Planner, bounded Determine и Research, Worker lifecycle и единая model boundary.

Отдельный важный переход произошёл в Edit. Сначала технические способы изменения файла жили ближе к Worker/Actions. Затем граница была перенесена в Engine: Worker сообщает semantic intent изменения, а Engine-owned `ProjectEditor` владеет authoritative source, стратегией materialization, recovery, buffering и commit. Это отделяет вопрос «что изменить» от «как и когда изменение становится состоянием проекта».

Validation появился сначала как lifecycle boundary с `PassValidator`, а не как заранее спроектированная система проверок. Реальные validators должны появляться из фактических сценариев.

## Переход 0.3 -> 0.4

Переход к 0.4 не обозначает один крупный feature или завершённую новую subsystem. Это смена этапа проекта после того, как основные execution boundaries 0.3 стали достаточно понятными, чтобы отдельно пересмотреть их происхождение и более широкий смысл Nodus.

В 0.4 были явнее зафиксированы две параллельные линии проекта: поиск границы ответственности между model/runtime и Project Understanding для semantic решений, остающихся за моделью. Документация была разделена по статусу знания на current architecture, development, project rules, history и research; восстановлены origin, архитектурная эволюция, decision log и каталог failure classes.

Эта версия также фиксирует более осторожный способ дальнейшей разработки: не превращать каждую перспективную идею в runtime contract, а сохранять hypothesis отдельно и двигать boundary после наблюдаемого failure/capability gap или подтверждённой необходимости.

Поэтому 0.4 следует понимать как новую фазу исследования и осознания проекта, а не как заявление о production maturity.

## Переход 0.4 -> 0.5

Переход к 0.5 связан уже не только с новым пониманием границ, а с изменением самого языка исполнения Nodus.

Вместо того чтобы считать фиксированный `Planner -> Worker -> ...` loop единственной формой runtime, проект вводит `ProcessRuntime` и явные schemas из фиксированных `STEP`. `SEQUENCE` становится локальной структурой исполнения с explicit data flow, Worker и Planner могут вернуть вложенную schema, а Core остаётся единственным её исполнителем и контролирует изменение ещё не выполненного хвоста.

Параллельно отделяется versioned `automation/` как подключаемый behavior layer. Core определяет Process/Worker contracts и shared mechanics, а concrete Planner/Qualifier/Worker modules становятся пользовательской конфигурацией, выраженной исполняемыми классами и schemas.

Worker boundary в 0.5 также перестаёт предполагать один способ реализации: Worker может предоставить `SCHEMA` либо custom `METHOD`. Это позволяет постепенно переводить устойчивые execution paths на schema, не заставляя все специализированные или экспериментальные Workers немедленно отказаться от кода.

0.5 поэтому фиксирует schema-driven Process как текущий архитектурный этап. Полная миграция production Engine на этот runtime остаётся отдельной работой и не считается уже завершённой только из-за появления Process contract.

## Presentation migration

В одном из промежуточных этапов Presentation была расширена на Planner, Determine, Research, Edit и Model. Каждая роль получила собственный concrete Presentation; общий `Presentation<TEvent>` остался renderer contract без общего semantic formatter DSL. Этот факт ранее оставался в корневом `README.txt`; при реорганизации документации артефакт удалён.

## Почему история хранится отдельно

Nodus остаётся архитектурным spike. Некоторые старые документы полезны именно как снимок того, через какую границу проект прошёл, но становятся вредными, если выглядят как current contract. Поэтому прошлые сценарии и первые runtime-прогоны находятся в `doc/history/`, а актуальное устройство — в `doc/architecture/`.
