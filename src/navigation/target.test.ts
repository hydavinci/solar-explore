import { expect, it } from 'vitest';
import { resolveTarget, type SpacecraftTargets } from './target';
import { createNavigation, EMPTY_INPUT, startFlight, stepNavigation } from './controller';
import { evaluateWorld } from '../simulation/world';
import { catalog } from '../simulation/catalog';
import { BODY_IDS } from '../simulation/types';
import { add, length, sub } from '../simulation/vector';
import { segmentClearsSphere } from './flight-path';

const world = evaluateWorld(2451545);
const targets: SpacecraftTargets = {
  'voyager-1': { id: 'voyager-1', positionKm: [2e9, 1e9, 1e8], framingRadiusKm: 10000, minimumDistanceKm: 1, obstacleId: null },
};

it('resolves only available spacecraft and preserves real body/ring framing', () => {
  expect(resolveTarget('saturn', world, catalog).framingRadiusKm).toBeCloseTo(catalog.saturn.radiusKm * 2.32);
  expect(resolveTarget('earth', world, catalog).obstacleId).toBe('earth');
  expect(resolveTarget('voyager-1', world, catalog, targets).positionKm).toEqual([2e9, 1e9, 1e8]);
  expect(() => resolveTarget('voyager-1', world, catalog)).toThrow();
  expect(() => resolveTarget('juno', world, catalog, targets)).toThrow();
});

it('flies to a spacecraft and retains all physical-body collision checks', () => {
  const original = JSON.stringify(catalog);
  let nav = startFlight(createNavigation(world, catalog), 'voyager-1', world, catalog, Math.PI / 3, targets);
  for (let i = 0; i < 200 && nav.mode === 'flight'; i++) {
    const before = nav.positionKm;
    nav = stepNavigation(nav, EMPTY_INPUT, world, catalog, 1 / 60, targets);
    for (const id of BODY_IDS) expect(segmentClearsSphere(before, nav.positionKm, world.bodies[id].positionKm, catalog[id].radiusKm * 1.01)).toBe(true);
  }
  expect(nav.mode).toBe('orbit');
  expect(nav.target).toBe('voyager-1');
  expect(length(sub(nav.positionKm, targets['voyager-1']!.positionKm))).toBeCloseTo(24000, 2);
  expect(JSON.stringify(catalog)).toBe(original);
  expect(Object.keys(catalog)).toHaveLength(10);
});

it('follows the spacecraft without spin and can zoom back out from the minimum view distance', () => {
  const target = targets['voyager-1']!;
  const nav = createNavigation(world, catalog, 'voyager-1', targets);
  const close = stepNavigation(nav, { ...EMPTY_INPUT, speedSteps: 100 }, world, catalog, 0, targets);
  expect(length(sub(close.positionKm, target.positionKm))).toBeGreaterThanOrEqual(0.999999);
  const moved: SpacecraftTargets = { 'voyager-1': { ...target, positionKm: add(target.positionKm, [100, 200, 300]) } };
  const next = stepNavigation({ ...close, mode: 'follow' }, EMPTY_INPUT, world, catalog, 0.1, moved);
  expect(sub(next.positionKm, close.positionKm)).toEqual([100, 200, 300]);
  expect(next.forward).toEqual(close.forward);
  const out = stepNavigation({ ...next, mode: 'orbit' }, { ...EMPTY_INPUT, speedSteps: -2 }, world, catalog, 0, moved);
  expect(length(sub(out.positionKm, moved['voyager-1']!.positionKm))).toBeGreaterThan(1.4);
});
