import { expect, it } from 'vitest';
import { createRuntime, getDisplayCamera, type RuntimeCommand } from './runtime';
import { evaluateWorld } from '../simulation/world';
import { catalog } from '../simulation/catalog';
import { add, length, normalize, scale, sub } from '../simulation/vector';
import { EMPTY_INPUT } from '../navigation/controller';
import { segmentClearsSphere } from '../navigation/flight-path';
import { BODY_IDS } from '../simulation/types';

it('defaults to Earth orbit, real scale, current UTC and stable snapshots', () => {
  const runtime = createRuntime();
  expect(runtime.getSnapshot()).toBe(runtime.getSnapshot());
  const { clock, scaleMode, navigation } = runtime.getSnapshot();
  expect(clock.rate).toBe(1);
  expect(scaleMode).toBe('real');
  expect(navigation.target).toBe('earth');
  expect(navigation.mode).toBe('orbit');
  expect(runtime.getCatalog()).toBe(catalog);
  runtime.dispose();
});
it.each([16 / 9, 0.6])('fits Saturn framing to the narrower camera FOV at aspect %s', aspect => {
  const runtime = createRuntime();
  runtime.dispatch({ type: 'set-paused', paused: true });
  const originalCatalog = JSON.stringify(catalog), before = runtime.getSnapshot();
  runtime.dispatch({ type: 'set-viewport', verticalFovRad: Math.PI / 3, aspect } as RuntimeCommand);
  expect(runtime.getSnapshot()).toBe(before);
  runtime.dispatch({ type: 'fly-to', id: 'saturn' });
  const offset = runtime.getSnapshot().navigation.flight!.destinationOffsetKm!;
  const fov = Math.min(Math.PI / 3, 2 * Math.atan(Math.tan(Math.PI / 6) * aspect));
  expect(length(offset) / catalog.saturn.radiusKm).toBeCloseTo(1.2 * 2.32 / Math.sin(fov / 2), 8);
  expect(JSON.stringify(catalog)).toBe(originalCatalog);
  runtime.dispose();
});
it('preserves date and target across mode changes and cancels flight', () => {
  const runtime = createRuntime(catalog, evaluateWorld);
  runtime.dispatch({ type: 'set-date', julianDay: 2451545 });
  runtime.dispatch({ type: 'fly-to', id: 'moon' });
  expect(runtime.getSnapshot().navigation.mode).toBe('flight');
  runtime.dispatch({ type: 'set-mode', mode: 'schematic' });
  const next = runtime.getSnapshot();
  expect(next.world.julianDay).toBe(2451545);
  expect(next.navigation.target).toBe('moon');
  expect(next.navigation.mode).toBe('orbit');
  expect(next.navigation.flight).toBeNull();
  expect(next.scaleMode).toBe('schematic');
});
it('notifies immediately after commands, at most 10Hz for ticking and unsubscribes', () => {
  const runtime = createRuntime();
  let count = 0;
  const stop = runtime.subscribe(() => count++);
  runtime.dispatch({ type: 'set-paused', paused: true });
  expect(count).toBe(1);
  for (let i = 0; i < 60; i++) runtime.tick(1 / 60);
  expect(count).toBeGreaterThanOrEqual(10);
  expect(count).toBeLessThanOrEqual(11);
  stop();
  runtime.dispatch({ type: 'set-rate', rate: 1 });
  const previousCount = count;
  runtime.tick(1);
  expect(count).toBe(previousCount);
  runtime.dispose();
});
it('keeps selected-target relative view during a date jump and does not catch up hidden time', () => {
  const runtime = createRuntime();
  runtime.dispatch({ type: 'set-date', julianDay: 2451545 });
  const initial = runtime.getSnapshot();
  const offset = sub(initial.navigation.positionKm, initial.world.bodies.earth.positionKm);
  runtime.dispatch({ type: 'set-date', julianDay: 2451600 });
  const jumped = runtime.getSnapshot();
  expect(length(sub(sub(jumped.navigation.positionKm, jumped.world.bodies.earth.positionKm), offset))).toBeLessThan(0.0001);
  runtime.dispatch({ type: 'set-hidden', hidden: true });
  runtime.tick(3600);
  expect(runtime.getSnapshot().clock.julianDay).toBe(2451600);
  runtime.dispatch({ type: 'set-hidden', hidden: false });
  runtime.tick(3600);
  expect(runtime.getSnapshot().clock.julianDay).toBe(2451600);
  runtime.tick(0.1);
  expect(runtime.getSnapshot().clock.julianDay).toBeGreaterThan(2451600);
});
it('does not recompute frozen worlds but does not leave accelerated time stale', () => {
  let calls = 0;
  const runtime = createRuntime(catalog, jd => { calls++; return evaluateWorld(jd); });
  runtime.dispatch({ type: 'set-paused', paused: true });
  const afterPause = calls;
  runtime.tick(0.1); runtime.tick(0.1);
  expect(calls).toBe(afterPause);
  runtime.dispatch({ type: 'set-rate', rate: 86400 });
  runtime.dispatch({ type: 'set-paused', paused: false });
  const before = runtime.getSnapshot().clock.julianDay;
  const next = runtime.tick(0.1);
  expect(next.world.julianDay).toBeCloseTo(before + 0.1, 8);
});
it('rejects invalid commands without damaging the last valid state, and handles all guide/navigation commands', () => {
  const runtime = createRuntime();
  const original = runtime.getSnapshot().clock.julianDay;
  for (const command of [{ type: 'set-rate', rate: NaN }, { type: 'set-date', julianDay: 1 }, { type: 'select', id: 'pluto' }, { type: 'set-mode', mode: 'oops' }]) {
    runtime.dispatch(command as RuntimeCommand);
    expect(runtime.getSnapshot().issue).not.toBeNull();
    expect(runtime.getSnapshot().clock.julianDay).toBe(original);
  }
  runtime.dispatch({ type: 'set-guide', key: 'orbitsVisible', visible: false });
  expect(runtime.getSnapshot().guides.orbitsVisible).toBe(false);
  runtime.dispatch({ type: 'set-navigation', mode: 'free' });
  const before = runtime.getSnapshot().navigation.positionKm;
  runtime.handleInput({ ...EMPTY_INPUT, localMove: [1, 0, 0] }, 0.1);
  expect(runtime.getSnapshot().navigation.positionKm).toBe(before);
  runtime.tick(0.1);
  expect(length(sub(runtime.getSnapshot().navigation.positionKm, before))).toBeGreaterThan(0);
  runtime.dispatch({ type: 'overview' });
  expect(runtime.getSnapshot().navigation.target).toBeNull();
});
it('queues input and advances a long accelerated flight against the new world without crossing the Sun', () => {
  const runtime = createRuntime();
  runtime.dispatch({ type: 'set-date', julianDay: 2451545 });
  runtime.dispatch({ type: 'set-rate', rate: 5254560 });
  runtime.dispatch({ type: 'fly-to', id: 'earth' });
  const initial = runtime.getSnapshot();
  runtime.handleInput(EMPTY_INPUT, 3);
  expect(runtime.getSnapshot()).toBe(initial);
  const next = runtime.tick(3);
  expect(next.world.julianDay).toBeCloseTo(2451727.45, 7);
  expect(segmentClearsSphere(initial.navigation.positionKm, next.navigation.positionKm, [0, 0, 0], catalog.sun.radiusKm * 1.01)).toBe(true);
});
it.each(['real', 'schematic'] as const)('selection alone never changes the active camera or flight in %s mode', mode => {
  const runtime = createRuntime();
  runtime.dispatch({ type: 'set-paused', paused: true });
  runtime.dispatch({ type: 'set-mode', mode });
  const initial = runtime.getSnapshot();
  runtime.dispatch({ type: 'select', id: 'neptune' });
  const selected = runtime.getSnapshot();
  expect(selected.selection).toEqual({ kind: 'body', id: 'neptune' });
  expect(selected.navigation).toBe(initial.navigation);
  expect(getDisplayCamera(selected, catalog)).toEqual(getDisplayCamera(initial, catalog));
  runtime.dispatch({ type: 'fly-to', id: 'moon' });
  const flight = runtime.getSnapshot();
  expect(flight.navigation.mode).toBe('flight');
  runtime.dispatch({ type: 'select', id: 'mars' });
  expect(runtime.getSnapshot().selection).toEqual({ kind: 'body', id: 'mars' });
  expect(runtime.getSnapshot().navigation).toBe(flight.navigation);
  runtime.dispatch({ type: 'set-navigation', mode: 'follow' });
  expect(runtime.getSnapshot().navigation.target).toBe('mars');
});
it('a schematic explicit flight preserves its starting display pose while changing anchors', () => {
  const runtime = createRuntime();
  runtime.dispatch({ type: 'set-mode', mode: 'schematic' });
  const before = getDisplayCamera(runtime.getSnapshot(), catalog);
  runtime.dispatch({ type: 'fly-to', id: 'moon' });
  const after = getDisplayCamera(runtime.getSnapshot(), catalog);
  expect(length(sub(before.position, after.position))).toBeLessThan(1e-7);
  expect(after.forward).toEqual(before.forward);
});
it('checks the mapped Moon safety sphere while zooming away from Earth in schematic mode', () => {
  const fixed = evaluateWorld(2451545);
  const earth = fixed.bodies.earth.positionKm;
  const outward = normalize(add(normalize(scale(earth, -1)), [0, 0, 0.45]));
  const synthetic = { ...fixed, bodies: { ...fixed.bodies, moon: { ...fixed.bodies.moon, positionKm: add(earth, scale(outward, 384400)) } } };
  const runtime = createRuntime(catalog, jd => ({ ...synthetic, julianDay: jd }));
  runtime.dispatch({ type: 'set-paused', paused: true });
  runtime.dispatch({ type: 'set-mode', mode: 'schematic' });
  let previous = getDisplayCamera(runtime.getSnapshot(), catalog).position;
  for (let i = 0; i < 20; i++) {
    runtime.handleInput({ ...EMPTY_INPUT, localMove: [0, 0, -1] }, 0.1);
    const frame = runtime.tick(0.1);
    const camera = getDisplayCamera(frame, catalog).position;
    for (const id of BODY_IDS) {
      const body = frame.displayWorld[id];
      expect(segmentClearsSphere(previous, camera, body.position, body.radius * 1.01), id).toBe(true);
    }
    previous = camera;
  }
});
it('select changes only selection, including while an issue is visible', () => {
  const runtime = createRuntime();
  runtime.dispatch({ type: 'set-rate', rate: NaN });
  const before = runtime.getSnapshot();
  runtime.dispatch({ type: 'select', id: 'saturn' });
  const after = runtime.getSnapshot();
  expect(after.issue).toBe(before.issue);
  expect({ ...after, selection: before.selection }).toEqual(before);
});
it.each(['real', 'schematic'] as const)('selects a spacecraft without altering a flight or clock in %s mode', mode => {
  const runtime = createRuntime();
  runtime.dispatch({ type: 'set-paused', paused: true });
  runtime.dispatch({ type: 'set-mode', mode });
  runtime.dispatch({ type: 'fly-to', id: 'saturn' });
  const before = runtime.getSnapshot();
  runtime.dispatch({ type: 'select-spacecraft', id: 'voyager-1' });
  const after = runtime.getSnapshot();
  expect(after.selection).toEqual({ kind: 'spacecraft', id: 'voyager-1' });
  expect(after.navigation).toBe(before.navigation);
  expect(after.clock).toBe(before.clock);
  expect(after.world).toBe(before.world);
  expect(getDisplayCamera(after, catalog)).toEqual(getDisplayCamera(before, catalog));
  runtime.dispatch({ type: 'select', id: 'earth' });
  expect(runtime.getSnapshot().selection).toEqual({ kind: 'body', id: 'earth' });
  expect(runtime.getSnapshot().navigation).toBe(before.navigation);
  runtime.dispose();
});
it('preserves an existing issue when selecting spacecraft and rejects invalid IDs', () => {
  const runtime = createRuntime();
  runtime.dispatch({ type: 'set-rate', rate: NaN });
  const before = runtime.getSnapshot();
  runtime.dispatch({ type: 'select-spacecraft', id: 'cassini' });
  const selected = runtime.getSnapshot();
  expect(selected.selection).toEqual({ kind: 'spacecraft', id: 'cassini' });
  expect({ ...selected, selection: before.selection }).toEqual(before);
  // Invalid external input must not index an inherited property or damage the current state.
  // @ts-expect-error deliberately testing runtime validation
  runtime.dispatch({ type: 'select-spacecraft', id: '__proto__' });
  expect(runtime.getSnapshot().issue?.message).toContain('未知航天器');
  expect(runtime.getSnapshot().selection).toBe(selected.selection);
  expect(runtime.getSnapshot().navigation).toBe(selected.navigation);
  runtime.dispose();
});
it.each(['orbit', 'follow'] as const)('refuses %s on a spacecraft without using the previous body', mode => {
  const runtime = createRuntime();
  runtime.dispatch({ type: 'select-spacecraft', id: 'juno' });
  const before = runtime.getSnapshot();
  runtime.dispatch({ type: 'set-navigation', mode });
  const after = runtime.getSnapshot();
  expect(after.issue?.message).toContain('暂无可用轨迹');
  expect(after.navigation).toBe(before.navigation);
  expect(after.selection).toBe(before.selection);
  runtime.dispose();
});
it('switches scale around the current body anchor, or overview, while a spacecraft is selected', () => {
  const runtime = createRuntime();
  runtime.dispatch({ type: 'fly-to', id: 'saturn' });
  runtime.dispatch({ type: 'select-spacecraft', id: 'cassini' });
  runtime.dispatch({ type: 'set-mode', mode: 'schematic' });
  expect(runtime.getSnapshot().navigation.target).toBe('saturn');
  expect(runtime.getSnapshot().selection).toEqual({ kind: 'spacecraft', id: 'cassini' });
  expect(runtime.getSnapshot().issue).toBeNull();
  runtime.dispatch({ type: 'overview' });
  runtime.dispatch({ type: 'set-mode', mode: 'real' });
  expect(runtime.getSnapshot().navigation.target).toBeNull();
  expect(runtime.getSnapshot().navigation.mode).toBe('free');
  expect(runtime.getSnapshot().issue).toBeNull();
  runtime.dispose();
});
it.each(BODY_IDS)('schematic flight to %s clears all displayed bodies and preserves physical data', id => {
  const runtime = createRuntime();
  runtime.dispatch({ type: 'set-date', julianDay: 2451545 });
  runtime.dispatch({ type: 'set-paused', paused: true });
  runtime.dispatch({ type: 'set-mode', mode: 'schematic' });
  const originalWorld = runtime.getSnapshot().world;
  const originalCatalog = JSON.stringify(catalog);
  let previous = getDisplayCamera(runtime.getSnapshot(), catalog).position;
  runtime.dispatch({ type: 'fly-to', id });
  expect(runtime.getSnapshot().navigation.mode).toBe('flight');
  expect(length(sub(previous, getDisplayCamera(runtime.getSnapshot(), catalog).position))).toBeLessThan(1e-7);
  for (let i = 0; i < 200 && runtime.getSnapshot().navigation.mode === 'flight'; i++) {
    runtime.handleInput(EMPTY_INPUT, 1 / 60);
    const frame = runtime.tick(1 / 60);
    const camera = getDisplayCamera(frame, catalog).position;
    for (const other of BODY_IDS) {
      const body = frame.displayWorld[other];
      expect(segmentClearsSphere(previous, camera, body.position, body.radius * 1.01), other).toBe(true);
    }
    previous = camera;
  }
  expect(runtime.getSnapshot().navigation.mode).toBe('orbit');
  expect(runtime.getSnapshot().world).toBe(originalWorld);
  expect(JSON.stringify(catalog)).toBe(originalCatalog);
});
