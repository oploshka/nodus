# Application layer

`app` — composition root Nodus. Его задача: собрать зависимости, применить конфигурацию, подключить внешние реализации и запустить Engine.

## Ответственность

`app` может:

- загрузить и нормализовать конфигурацию;
- создать logger implementation;
- создать model adapter и `ModelRunner`;
- создать Project/Research/Planner/Worker/Engine и связать их через constructor DI;
- принять ввод CLI и вызвать публичный API Engine.

`app` не должен:

- решать, как разбить пользовательскую задачу;
- выбирать ExecutionAction;
- выполнять Research;
- редактировать проект как часть task reasoning;
- содержать retry/recovery policy Worker.

DI односторонний: app создаёт объекты и передаёт зависимости в constructors. Engine и model не должны обращаться к глобальному service locator.

## Logging

Реализации logger находятся в `app/logging`, потому что выбор sink/output — часть запуска приложения. Сам минимальный logging port (`EngineLogger`) определён в engine, чтобы engine не зависел от app.

Reporting для пользователя следует держать отдельно от технического logging, когда он появится.
