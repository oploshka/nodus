# Validation

`Validation` появился как первая Engine-owned boundary для deterministic checks после Edit. В ходе 0.4 эта ответственность начала разделяться.

Project-level проверки итогового состояния Task теперь принадлежат [`EngineTest`](engine-test.md): `ResolveEngineTest`, `TypecheckEngineTest`, `UnitEngineTest` и их composition.

Существующие `Validator`, `ValidationCheck`, `JsonValidationCheck`, `CommandValidationCheck` и `PassValidator` пока остаются в коде как промежуточный слой после Validation v2. Они будут перераспределены после стабилизации накопительного Edit и EngineTest.

Наиболее вероятная граница для части оставшихся checks — сам Edit. Например проверка подготовленного JSON или другого content-level результата логичнее до физического `apply()`, чем как общая post-commit проверка Engine.

Текущая задача документа не закрепить финальный Validation design, а явно не выдавать старую Validation v2 схему за актуальную orchestration boundary.
