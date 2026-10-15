import type { BodyId } from '../simulation/types';

export const SATURN_RING_OUTER_RADIUS = 2.32;
export function visualRadius(id: BodyId, physicalRadius: number): number {
  return physicalRadius * (id === 'saturn' ? SATURN_RING_OUTER_RADIUS : 1);
}
