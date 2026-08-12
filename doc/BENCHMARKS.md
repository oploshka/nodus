# Benchmarks and experiments

Этот файл сохраняет контекст прошлых экспериментов, но не объявляет результаты универсальными свойствами Nodus.

На простом `/status` сценарии старая 14B-конфигурация после ограничения research/edit pipeline показывала существенно меньший runtime, чем та же модель в свободном agent loop. Основной эффект был получен не за счёт «улучшения интеллекта» модели, а за счёт переноса поиска, состояния, ограничений, retries и patch mechanics в Nodus.

Эти результаты используются только как мотивация архитектуры. Новая 0.3 реализация должна заново измеряться на одинаковых Scenario contracts.

При benchmark важно фиксировать:

- model/configuration;
- scenario id;
- число model calls;
- wall-clock duration;
- success/failure;
- execution log;
- изменённые файлы.

Model benchmarks следует запускать последовательно (`concurrency=1`).
