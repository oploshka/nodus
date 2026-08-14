# Настройки Nodus

`NodusSettings` отделяет настройки поведения самого Nodus от `nodus.config.json`, который описывает конкретный target-проект и его запуск.

Текущая граница:

```text
NodusSettings
  -> process adaptation / встроенные defaults самого Nodus

nodus.config.json
  -> project / model / runtime / EngineTest / language конкретного проекта
```

Сейчас `NodusSettings` существует как типизированный внутренний TS-contract в `src/settings/`, а `defaultSettings.ts` содержит встроенный default. `Bootstrap` использует этот default при сборке Engine. Внешний `nodus.settings.ts` или JSON-формат пока не реализован.

## Process adaptation

Первым вынесенным разделом является адаптация поведения Worker:

```text
process.worker
  change
    guidance

  research
    guidance

  profiles
    code
    documentation
```

`change.guidance` задаёт поведенческие правила для `ChangeCodeAction`: держать границы текущего `PlanStep`, не запускать Research только ради дополнительной уверенности и переходить к edit intent, когда имеющихся данных достаточно.

`research.guidance` настраивает способ ответа Research на конкретный пробел в знаниях. Это позволяет менять глубину и стиль Research независимо от самого `ResearchAction`.

`profiles` хранит различия между Worker-профилями (`purpose`, дополнительный `guidance`, стратегия Edit), чтобы Bootstrap не содержал их prompt-тексты напрямую.

Prompt/protocol инструкции, которые определяют машинный формат ответа или технический контракт конкретного data-layer, пока остаются рядом с соответствующей реализацией. `NodusSettings` предназначен прежде всего для изменяемой policy/adaptation, а не для механического переноса всех строк prompt из кода.

## Дальнейшее направление

Позже эта граница может стать основой для model-specific profiles и внешнего `nodus.settings.ts`. Project-level `nodus.config.json` сможет переопределять отдельные настройки поверх default, но такое разрешение overrides пока не реализовано.
