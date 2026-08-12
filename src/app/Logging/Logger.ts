import type { EngineLogger } from '@engine/Type/EngineLogger.js';

export class ConsoleLogger implements EngineLogger {
  public info(event: string, data?: unknown): void { console.log(`[info] ${event}`, data ?? ''); }
  public warn(event: string, data?: unknown): void { console.warn(`[warn] ${event}`, data ?? ''); }
  public error(event: string, data?: unknown): void { console.error(`[error] ${event}`, data ?? ''); }
}

export class NullLogger implements EngineLogger {
  public info(): void {}
  public warn(): void {}
  public error(): void {}
}
