export interface Logger {
  info(event: string, data?: unknown): void;
  warn(event: string, data?: unknown): void;
  error(event: string, data?: unknown): void;
}

export class ConsoleLogger implements Logger {
  public info(event: string, data?: unknown): void { console.log(`[info] ${event}`, data ?? ''); }
  public warn(event: string, data?: unknown): void { console.warn(`[warn] ${event}`, data ?? ''); }
  public error(event: string, data?: unknown): void { console.error(`[error] ${event}`, data ?? ''); }
}

export class NullLogger implements Logger {
  public info(): void {}
  public warn(): void {}
  public error(): void {}
}
