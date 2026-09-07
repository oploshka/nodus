import type { EnginePoint } from './EnginePoint.js';

export interface sEnginePointNextDirective {
  readonly type: 'point-next';
  readonly point: EnginePoint;
  readonly input?: unknown;
}

/** Runtime protocol returned by Step schema callbacks to describe continuation. */
export type tEngineDirective = sEnginePointNextDirective;

export function enginePointNext(
  point: EnginePoint,
  input?: unknown,
): sEnginePointNextDirective {
  return {
    type: 'point-next',
    point,
    input,
  };
}

export function isEngineDirective(value: unknown): value is tEngineDirective {
  if (typeof value !== 'object' || value === null) return false;
  const directive = value as Partial<sEnginePointNextDirective>;
  return directive.type === 'point-next' && directive.point !== undefined;
}
