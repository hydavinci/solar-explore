import { expect, it } from 'vitest';
import { planFlight, segmentClearsSphere, clipMovement } from './flight-path';
import { catalog } from '../simulation/catalog';
import { evaluateWorld } from '../simulation/world';
import { BODY_IDS, type Vec3 } from '../simulation/types';
import { add, length, sub } from '../simulation/vector';

it('checks swept segments rather than endpoints', () => {
  expect(segmentClearsSphere([-2, 0, 0], [2, 0, 0], [0, 0, 0], 1)).toBe(false);
  expect(segmentClearsSphere([-2, 2, 0], [2, 2, 0], [0, 0, 0], 1)).toBe(true);
  expect(segmentClearsSphere([0, 0, 0], [0, 0, 0], [0, 0, 0], 1)).toBe(false);
});
it('plans a genuinely clear detour on every segment around the Sun', () => {
  const world = evaluateWorld(2451545);
  const r = catalog.sun.radiusKm;
  const result = planFlight([-r * 4, 0, 0], [r * 4, 0, 0], world, catalog);
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.points.length).toBeGreaterThan(2);
  for (let i = 1; i < result.points.length; i++) for (const id of BODY_IDS) {
    expect(segmentClearsSphere(result.points[i - 1]!, result.points[i]!, world.bodies[id].positionKm, catalog[id].radiusKm * 1.01), id).toBe(true);
  }
});
it('fails explicitly for endpoints inside a planet and clips high-speed motion before entry', () => {
  const world = evaluateWorld(2451545);
  const center = world.bodies.earth.positionKm;
  const r = catalog.earth.radiusKm;
  const start = add(center, [-r * 4, 0, 0]), end = add(center, [r * 4, 0, 0]);
  expect(planFlight(start, center, world, catalog).ok).toBe(false);
  const clipped: Vec3 = clipMovement(start, end, world, catalog);
  expect(clipped[0]).toBeLessThan(center[0]);
  expect(length(sub(clipped, center))).toBeGreaterThanOrEqual(r * 1.01);
});
