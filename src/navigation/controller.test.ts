import { expect, it } from 'vitest';
import { createNavigation, EMPTY_INPUT, startFlight, stepNavigation } from './controller';
import { catalog } from '../simulation/catalog';
import { evaluateWorld } from '../simulation/world';
import { add, dot, length, normalize, scale, sub } from '../simulation/vector';
import { BODY_IDS } from '../simulation/types';
import { segmentClearsSphere } from './flight-path';

const world = evaluateWorld(2451545);
it('starts at four Earth radii looking at the target', () => {
  const state = createNavigation(world, catalog);
  expect(state.mode).toBe('orbit');
  expect(length(sub(state.positionKm, world.bodies.earth.positionKm))).toBeCloseTo(catalog.earth.radiusKm * 4, 5);
  expect(length(state.forward)).toBeCloseTo(1);
});
it('preserves target-relative position across moving centers without inheriting spin', () => {
  const state = { ...createNavigation(world, catalog), mode: 'follow' as const };
  const moved = { ...world, bodies: { ...world.bodies, earth: { ...world.bodies.earth, positionKm: add(world.bodies.earth.positionKm, [100, 200, 300]), spinRad: 3 } } };
  const next = stepNavigation(state, EMPTY_INPUT, moved, catalog, 0.1);
  expect(sub(next.positionKm, state.positionKm)).toEqual([100, 200, 300]);
  expect(next.forward).toEqual(state.forward);
});
it.each(['orbit', 'follow'] as const)('keeps %s at minimum altitude when the target moves through the old camera position', mode => {
  const near = stepNavigation(createNavigation(world, catalog, 'mercury'), { ...EMPTY_INPUT, speedSteps: 100 }, world, catalog, 0);
  const offset = sub(near.positionKm, world.bodies.mercury.positionKm);
  const center = add(world.bodies.mercury.positionKm, scale(normalize(offset), 0.5));
  const moved = { ...world, bodies: { ...world.bodies, mercury: { ...world.bodies.mercury, positionKm: center } } };
  expect(length(sub(near.positionKm, center))).toBeLessThan(catalog.mercury.radiusKm * 1.01);
  const next = stepNavigation({ ...near, mode }, EMPTY_INPUT, moved, catalog, 1 / 60);
  expect(next.mode).toBe(mode);
  expect(next.issue).toBeNull();
  expect(length(sub(sub(next.positionKm, center), offset))).toBeLessThan(1e-6);
  expect(length(sub(next.positionKm, center))).toBeGreaterThan(catalog.mercury.radiusKm * 1.01);
});
it('still stops near-surface target tracking when another body blocks the translation', () => {
  const near = stepNavigation(createNavigation(world, catalog), { ...EMPTY_INPUT, speedSteps: 100 }, world, catalog, 0);
  const obstacle = add(near.positionKm, [0, 0, 10000]);
  const moved = { ...world, bodies: { ...world.bodies,
    earth: { ...world.bodies.earth, positionKm: add(world.bodies.earth.positionKm, [0, 0, 20000]) },
    moon: { ...world.bodies.moon, positionKm: obstacle },
  } };
  const next = stepNavigation(near, EMPTY_INPUT, moved, catalog, 1 / 60);
  expect(next.mode).toBe('free');
  expect(next.issue).toBeTruthy();
  expect(segmentClearsSphere(near.positionKm, next.positionKm, obstacle, catalog.moon.radiusKm * 1.01)).toBe(true);
});
it('orbits with movement/look input and moves in free mode using real seconds', () => {
  const state = createNavigation(world, catalog);
  const orbit = stepNavigation(state, { ...EMPTY_INPUT, lookDelta: [80, 20] }, world, catalog, 0.1);
  expect(length(sub(orbit.positionKm, state.positionKm))).toBeGreaterThan(100);
  expect(length(sub(orbit.positionKm, world.bodies.earth.positionKm))).toBeCloseTo(catalog.earth.radiusKm * 4, 4);
  const free = stepNavigation({ ...state, mode: 'free' }, { ...EMPTY_INPUT, localMove: [1, 0, 0], speedSteps: 2 }, world, catalog, 0.1);
  expect(free.speedMultiplier).toBe(4);
  expect(length(sub(free.positionKm, state.positionKm))).toBeGreaterThan(0);
});
it('zooms orbit distance with wheel steps even at zero delta without changing free-flight speed', () => {
  const state = createNavigation(world, catalog);
  const distance = (position: typeof state.positionKm) => length(sub(position, world.bodies.earth.positionKm));
  const inward = stepNavigation(state, { ...EMPTY_INPUT, speedSteps: 1 }, world, catalog, 0);
  const outward = stepNavigation(state, { ...EMPTY_INPUT, speedSteps: -1 }, world, catalog, 0);
  expect(distance(inward.positionKm)).toBeLessThan(distance(state.positionKm));
  expect(distance(outward.positionKm)).toBeGreaterThan(distance(state.positionKm));
  expect(inward.speedMultiplier).toBe(state.speedMultiplier);
  expect(outward.speedMultiplier).toBe(state.speedMultiplier);
  const reverse = stepNavigation(inward, { ...EMPTY_INPUT, speedSteps: -1 }, world, catalog, 0);
  expect(distance(reverse.positionKm)).toBeCloseTo(distance(state.positionKm), 5);
});
it('keeps wheel zoom above the target safety sphere and cannot cross another body', () => {
  const state = createNavigation(world, catalog);
  const inward = stepNavigation(state, { ...EMPTY_INPUT, speedSteps: 100 }, world, catalog, 0);
  expect(length(sub(inward.positionKm, world.bodies.earth.positionKm))).toBeGreaterThan(catalog.earth.radiusKm * 1.01);
  const center = world.bodies.earth.positionKm;
  const direction = normalize(sub(state.positionKm, center));
  const custom = { ...world, bodies: { ...world.bodies, moon: { ...world.bodies.moon,
    positionKm: add(center, scale(direction, catalog.earth.radiusKm * 8)) } } };
  const outward = stepNavigation(state, { ...EMPTY_INPUT, speedSteps: -10 }, custom, catalog, 0);
  expect(segmentClearsSphere(state.positionKm, outward.positionKm, custom.bodies.moon.positionKm, catalog.moon.radiusKm * 1.01)).toBe(true);
});
it('finishes a three-second flight in orbit and follows the moving endpoint', () => {
  let state = startFlight(createNavigation(world, catalog), 'moon', world, catalog);
  expect(state.mode).toBe('flight');
  for (let i = 0; i < 30; i++) state = stepNavigation(state, EMPTY_INPUT, world, catalog, 0.1);
  expect(state.mode).toBe('orbit');
  expect(state.target).toBe('moon');
  expect(length(sub(state.positionKm, world.bodies.moon.positionKm))).toBeCloseTo(catalog.moon.radiusKm * 2.4, 3);
});
it('movement or Escape cancels flight without losing selection', () => {
  const flight = startFlight(createNavigation(world, catalog), 'moon', world, catalog);
  for (const input of [{ ...EMPTY_INPUT, cancel: true }, { ...EMPTY_INPUT, localMove: [1, 0, 0] as const }]) {
    const state = stepNavigation(flight, input, world, catalog, 0.01);
    expect(state.mode).toBe('free');
    expect(state.flight).toBeNull();
    expect(state.target).toBe('moon');
  }
});
it('projects a camera out of time-jump overlap and exposes the adjustment', () => {
  const state = { ...createNavigation(world, catalog), mode: 'free' as const, positionKm: world.bodies.mars.positionKm };
  const next = stepNavigation(state, EMPTY_INPUT, world, catalog, 0);
  expect(length(sub(next.positionKm, world.bodies.mars.positionKm))).toBeGreaterThan(catalog.mars.radiusKm * 1.01);
  expect(next.issue).toBeTruthy();
});
it.each(BODY_IDS)('flies from Earth to %s with clear inter-frame segments', id => {
  let state = startFlight(createNavigation(world, catalog), id, world, catalog);
  for (let i = 0; i < 181 && state.mode === 'flight'; i++) {
    const before = state.positionKm;
    state = stepNavigation(state, EMPTY_INPUT, world, catalog, 1 / 60);
    for (const obstacle of BODY_IDS) expect(segmentClearsSphere(before, state.positionKm, world.bodies[obstacle].positionKm, catalog[obstacle].radiusKm * 1.01), obstacle).toBe(true);
    expect(state.issue).toBeNull();
  }
  expect(state.mode).toBe('orbit');
  expect(length(sub(state.positionKm, world.bodies[id].positionKm))).toBeCloseTo(catalog[id].radiusKm * 2.4 * (id === 'saturn' ? 2.32 : 1), 2);
});
it('tracks a moving lunar endpoint throughout accelerated simulation time', () => {
  let state = startFlight(createNavigation(world, catalog), 'moon', world, catalog);
  let current = world;
  for (let i = 1; i <= 30; i++) {
    current = evaluateWorld(2451545 + i / 100);
    state = stepNavigation(state, EMPTY_INPUT, current, catalog, 0.1);
  }
  expect(state.mode).toBe('orbit');
  expect(length(sub(state.positionKm, current.bodies.moon.positionKm))).toBeCloseTo(catalog.moon.radiusKm * 2.4, 2);
});
it('does not cut through a detour sphere even with a single long frame', () => {
  const initial = { ...createNavigation(world, catalog), positionKm: [-catalog.sun.radiusKm * 4, 0, 0] as const };
  // A synthetic target on the far side of the Sun makes the failure independent of ephemeris geometry.
  const custom = { ...world, bodies: { ...world.bodies, earth: { ...world.bodies.earth, positionKm: [catalog.sun.radiusKm * 4, 0, 0] as const } } };
  const flight = startFlight(initial, 'earth', custom, catalog);
  const next = stepNavigation(flight, EMPTY_INPUT, custom, catalog, 3);
  expect(segmentClearsSphere(initial.positionKm, next.positionKm, [0, 0, 0], catalog.sun.radiusKm * 1.01)).toBe(true);
});
it('can orbit at minimum altitude rather than clipping every inward chord to zero', () => {
  const original = createNavigation(world, catalog);
  const center = world.bodies.earth.positionKm;
  const state = { ...original, positionKm: add(center, scale(normalize(sub(original.positionKm, center)), catalog.earth.radiusKm * 1.01 * (1 + 1e-8))) };
  const next = stepNavigation(state, { ...EMPTY_INPUT, lookDelta: [100, 0] }, world, catalog, 0.1);
  expect(length(sub(next.positionKm, state.positionKm))).toBeGreaterThan(1000);
  expect(length(sub(next.positionKm, center))).toBeGreaterThanOrEqual(catalog.earth.radiusKm * 1.01);
});
it('preserves camera up through yaw beyond ninety degrees and keeps an orthonormal basis', () => {
  const state = { ...createNavigation(world, catalog), mode: 'free' as const, forward: [1, 0, 0] as const, up: [0, 0, 1] as const };
  for (const x of [600, -600, 1047]) {
    const next = stepNavigation(state, { ...EMPTY_INPUT, lookDelta: [x, 0] }, world, catalog, 0.1);
    expect(dot(next.up, state.up)).toBeGreaterThan(0.999999);
    expect(Math.abs(dot(next.up, next.forward))).toBeLessThan(1e-12);
    expect(length(next.forward)).toBeCloseTo(1, 12);
  }
});
it('does not translate an orbit anchor through the Sun on a large time advance', () => {
  const state = createNavigation(world, catalog);
  const advanced = evaluateWorld(2451727.45);
  const next = stepNavigation(state, EMPTY_INPUT, advanced, catalog, 3);
  expect(segmentClearsSphere(state.positionKm, next.positionKm, [0, 0, 0], catalog.sun.radiusKm * 1.01)).toBe(true);
  expect(next.issue).toBeTruthy();
});
