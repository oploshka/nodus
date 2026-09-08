import type { iEngineStep } from './EngineStepInterface.js';

export interface sEngineEvent {
  type: string;
  level?: string;
  data?: unknown;
}

/** Event enriched with the concrete Step execution that produced it. */
export interface sEngineEventEnvelope {
  event: sEngineEvent;
  path: readonly string[];
  module?: string;
  step?: iEngineStep;
}

export type tEngineEmit = (event: sEngineEvent) => void;
export type tEngineEventListener = (envelope: sEngineEventEnvelope) => void;
