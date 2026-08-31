import type { sEngineSequence } from './EngineSchemaTsType.js';

/** Runtime wrapper for an Engine execution schema. */
export class EngineSchema {
  public constructor(public readonly value: sEngineSequence) {}
}
