export interface sEngineEvent {
  type: string;
  level?: string;
  data?: unknown;
}

export type tEngineEmit = (event: sEngineEvent) => void;
