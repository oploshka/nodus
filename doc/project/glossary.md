# Глоссарий Nodus

Короткие определения нужны, чтобы одни и те же термины не меняли смысл между кодом, prompts и документацией. Если определение расходится с текущим runtime contract, authoritative остаётся соответствующая документация в `doc/architecture/` и код.

- **Task** — пользовательская задача, переданная Engine как единица верхнего уровня.
- **Plan** — semantic decomposition Task, построенная Planner.
- **PlanStep** — один semantic outcome с constraints и причиной decomposition; не техническая стадия исполнения.
- **Planner** — bounded service, превращающий Task в небольшой semantic Plan.
- **Determine** — bounded выбор одного option из ограниченного набора; сейчас используется, в частности, для Worker routing.
- **Worker** — исполнитель одного PlanStep через ограниченный Action loop.
- **Action** — explicit bounded операция внутри Worker execution. Action не должен автоматически становиться новым архитектурным слоем.
- **Research** — bounded получение конкретного project fact/evidence, обычно после explicit missing information.
- **Project** — текущее файловое/проектное состояние, с которым работает Nodus; authoritative source для runtime операций.
- **ProjectEditRequest** — semantic intent изменения, который Worker возвращает Engine: target path и instruction, optional preferred strategy.
- **EditStrategy** — Engine-owned способ материализации semantic edit intent, например `range-replace`, `replace`, `diff` или full-file `edit`.
- **Validation** — Engine-owned lifecycle boundary проверки результата. Текущий `PassValidator` является skeleton, а не реальной validation policy.
- **Workspace / Virtual Workspace** — исследуемое task-wide виртуальное состояние Project, в котором подготовленные изменения могут быть видны последующим шагам до физического commit.
- **Project Understanding** — общая проблема предоставления модели релевантного понимания конкретного проекта: существующих решений, ограничений, соглашений, исключений и архитектурных причин.
- **Project Knowledge** — потенциально persistent project-specific knowledge. Это research concept, а не текущая завершённая subsystem.
- **Context** — конкретный набор информации, доступный модели в данном вызове. Context не тождественен persistent Knowledge.
- **Transient context** — session/user state вроде active file, selection или текущего UI context; не должен автоматически становиться Project Knowledge.
- **Project Policy** — правило/ограничение самого проекта, например требование использовать существующий project mechanism. Пока research terminology.
- **Execution Policy** — runtime/control ограничение исполнения, например approval, limits или обязательная verification. Не тождественно Project Policy.
- **KnowledgeCandidate** — историческая/research идея: наблюдение, human answer или успешное изменение ещё не автоматически знание; перед promotion могут быть нужны source, scope, confidence и review.
- **Capability gap** — повторяющаяся ситуация, где текущих contracts/tools/context недостаточно для класса задач. Gap является сигналом для исследования, а не автоматическим требованием создать новую abstraction.
