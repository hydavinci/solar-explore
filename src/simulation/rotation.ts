import type { BodyDefinition } from './types';
export function evaluateSpin(body: BodyDefinition, julianDay: number): number {
  if (!Number.isFinite(julianDay) || !Number.isFinite(body.rotationPeriodDays) || body.rotationPeriodDays === 0) throw new Error('Invalid spin parameters');
  const angle = body.rotationPhaseRad + (julianDay - body.rotationEpochJd) / body.rotationPeriodDays * 2 * Math.PI;
  return ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
}
