import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { createRuntime, getDisplayCamera } from './runtime';
import { catalog } from '../simulation/catalog';
import { evaluateWorld } from '../simulation/world';
import { decodeTrajectory, sampleTrajectory, type TrajectoryData } from '../spacecraft/trajectory';
import { EMPTY_INPUT } from '../navigation/controller';
import { BODY_IDS } from '../simulation/types';
import { length, sub } from '../simulation/vector';
import { segmentClearsSphere } from '../navigation/flight-path';

const data = decodeTrajectory(JSON.parse(readFileSync(new URL('../../public/trajectories/voyager-1-jupiter-1979.json', import.meta.url), 'utf8')));
const jd = (ms: number) => ms / 86400000 + 2440587.5;
async function ready() {
  const runtime = createRuntime(catalog, evaluateWorld, async () => data);
  runtime.dispatch({ type: 'load-trajectory' });
  await vi.waitFor(() => expect(runtime.getSnapshot().trajectory.kind).toBe('ready'));
  return runtime;
}

it('resource completion never changes time, camera, selection or planet source', async () => {
  let resolve!: (data: TrajectoryData) => void;
  const runtime = createRuntime(catalog, evaluateWorld, () => new Promise(r => { resolve = r; }));
  runtime.dispatch({ type: 'set-date', julianDay: jd(Date.parse('1979-03-05T12:00:00Z')) });
  runtime.dispatch({ type: 'set-paused', paused: true });
  const before = runtime.getSnapshot();
  runtime.dispatch({ type: 'load-trajectory' });
  expect(runtime.getSnapshot().trajectory.kind).toBe('loading');
  runtime.dispatch({ type: 'enter-replay' });
  expect(runtime.getSnapshot().replayActive).toBe(false);
  resolve(data);
  await vi.waitFor(() => expect(runtime.getSnapshot().trajectory.kind).toBe('ready'));
  const after = runtime.getSnapshot();
  expect(after.clock).toBe(before.clock);
  expect(after.navigation).toBe(before.navigation);
  expect(after.selection).toBe(before.selection);
  expect(after.world).toBe(before.world);
  expect(after.spacecraftState).toBeNull();
  runtime.dispose();
});

it('aborted or stale requests cannot overwrite a retry or resurrect disposed state', async () => {
  const pending: { signal: AbortSignal; resolve: (data: TrajectoryData) => void; reject: (error: Error) => void }[] = [];
  const runtime = createRuntime(catalog, evaluateWorld, signal => new Promise((resolve, reject) => pending.push({ signal, resolve, reject })));
  runtime.dispatch({ type: 'load-trajectory' });
  runtime.cancelTrajectoryLoad();
  expect(pending[0]!.signal.aborted).toBe(true);
  runtime.dispatch({ type: 'load-trajectory' });
  pending[1]!.reject(new Error('broken local asset'));
  await vi.waitFor(() => expect(runtime.getSnapshot().trajectory.kind).toBe('error'));
  pending[0]!.resolve(data);
  await Promise.resolve();
  expect(runtime.getSnapshot().trajectory.kind).toBe('error');
  expect(runtime.getSnapshot().world.bodies.earth.positionKm.every(Number.isFinite)).toBe(true);
  runtime.dispatch({ type: 'load-trajectory' });
  pending[2]!.resolve(data);
  await vi.waitFor(() => expect(runtime.getSnapshot().trajectory.kind).toBe('ready'));
  runtime.dispose();
});

it('out-of-range list selection and G do not invent a position or change the date', async () => {
  const runtime = await ready();
  runtime.dispatch({ type: 'set-date', julianDay: 2451545 });
  const before = runtime.getSnapshot();
  runtime.dispatch({ type: 'activate-spacecraft', id: 'voyager-1' });
  runtime.dispatch({ type: 'fly-to-spacecraft', id: 'voyager-1' });
  expect(runtime.getSnapshot().clock).toBe(before.clock);
  expect(runtime.getSnapshot().navigation).toBe(before.navigation);
  expect(runtime.getSnapshot().spacecraftState).toBeNull();
  expect(runtime.getSnapshot().issue?.message).toBeTruthy();
  runtime.dispose();
});

it.each(['real', 'schematic'] as const)('explicit %s replay has matching Jupiter data and safe spacecraft flight', async mode => {
  const runtime = await ready();
  runtime.dispatch({ type: 'set-mode', mode });
  runtime.dispatch({ type: 'enter-replay' });
  let frame = runtime.getSnapshot();
  expect(frame.issue).toBeNull();
  expect(frame.replayActive).toBe(true);
  expect(frame.clock.julianDay).toBe(jd(Date.parse('1979-03-05T12:00:00Z')));
  expect(frame.clock.paused).toBe(true);
  expect(frame.clock.rate).toBe(3600);
  expect(frame.navigation.target).toBe('voyager-1');
  expect(frame.world.bodies.jupiter.positionKm).toEqual(frame.spacecraftState!.jupiter.positionKm);
  const baseline = evaluateWorld(frame.clock.julianDay);
  for (const id of BODY_IDS.filter(id => id !== 'jupiter')) expect(frame.world.bodies[id]).toEqual(baseline.bodies[id]);
  for (let i = 0; i < 220 && frame.navigation.mode === 'flight'; i++) {
    const before = getDisplayCamera(frame, catalog).position;
    frame = runtime.tick(1 / 60);
    const after = getDisplayCamera(frame, catalog).position;
    for (const id of BODY_IDS) {
      expect(segmentClearsSphere(before, after, frame.displayWorld[id].position, frame.displayWorld[id].radius * 1.01), id).toBe(true);
    }
  }
  expect(frame.navigation.mode).toBe('orbit');
  runtime.dispatch({ type: 'set-navigation', mode: 'follow' });
  const relative = sub(runtime.getSnapshot().navigation.positionKm, frame.spacecraftState!.spacecraft.positionKm);
  runtime.dispatch({ type: 'set-paused', paused: false });
  frame = runtime.tick(0.1);
  expect(frame.spacecraftState).not.toBeNull();
  if (mode === 'real') expect(length(sub(sub(frame.navigation.positionKm, frame.spacecraftState!.spacecraft.positionKm), relative))).toBeLessThan(1e-5);
  runtime.dispose();
});

it('selection-only clicks preserve replay and exiting restores Jupiter without changing time', async () => {
  const runtime = await ready();
  runtime.dispatch({ type: 'enter-replay' });
  runtime.tick(3);
  const before = runtime.getSnapshot();
  runtime.dispatch({ type: 'select-spacecraft', id: 'cassini' });
  expect(runtime.getSnapshot().navigation).toBe(before.navigation);
  expect(runtime.getSnapshot().replayActive).toBe(true);
  runtime.dispatch({ type: 'exit-replay' });
  const after = runtime.getSnapshot();
  expect(after.clock).toBe(before.clock);
  expect(after.replayActive).toBe(false);
  expect(after.spacecraftState).toBeNull();
  expect(after.navigation.target).toBeNull();
  expect(after.navigation.mode).toBe('free');
  expect(after.world.bodies.jupiter).toEqual(evaluateWorld(after.clock.julianDay).bodies.jupiter);
  runtime.dispose();
});

it('stops at a crossed guard gap even when a large tick ends inside another valid segment', async () => {
  const runtime = await ready();
  runtime.dispatch({ type: 'enter-replay' });
  const start = data.segments[3]!.endUtcMs - 1000;
  runtime.dispatch({ type: 'set-date', julianDay: jd(start) });
  runtime.dispatch({ type: 'set-rate', rate: 10 });
  runtime.dispatch({ type: 'set-paused', paused: false });
  const frame = runtime.tick(1);
  expect(sampleTrajectory(data, start + 10000)).not.toBeNull();
  expect(frame.replayActive).toBe(false);
  expect(frame.clock.paused).toBe(true);
  expect(frame.spacecraftState).toBeNull();
  expect(frame.navigation.target).toBeNull();
  expect(frame.issue?.message).toMatch(/数据段|范围/);
  runtime.dispose();
});

it('manual out-of-range dates are honored and never reactivate a later valid date automatically', async () => {
  const runtime = await ready();
  runtime.dispatch({ type: 'enter-replay' });
  runtime.dispatch({ type: 'set-paused', paused: false });
  runtime.dispatch({ type: 'set-date', julianDay: 2451545 });
  expect(runtime.getSnapshot().clock.paused).toBe(false);
  expect(runtime.getSnapshot().clock.julianDay).toBe(2451545);
  expect(runtime.getSnapshot().replayActive).toBe(false);
  runtime.dispatch({ type: 'set-date', julianDay: 2443938 });
  expect(runtime.getSnapshot().replayActive).toBe(false);
  expect(runtime.getSnapshot().spacecraftState).toBeNull();
  runtime.dispatch({ type: 'activate-spacecraft', id: 'voyager-1' });
  expect(runtime.getSnapshot().replayActive).toBe(true);
  expect(runtime.getSnapshot().clock.julianDay).toBe(2443938);
  runtime.handleInput(EMPTY_INPUT, 0);
  runtime.dispose();
});

it.each(['real', 'schematic'] as const)('restoring the normal Jupiter source preserves its %s target-relative camera', async mode => {
  const runtime = await ready();
  runtime.dispatch({ type: 'set-mode', mode });
  runtime.dispatch({ type: 'enter-replay' });
  runtime.tick(3);
  runtime.dispatch({ type: 'select', id: 'jupiter' });
  runtime.dispatch({ type: 'set-navigation', mode: 'orbit' });
  const before = runtime.getSnapshot();
  const relative = sub(before.navigation.positionKm, before.world.bodies.jupiter.positionKm);
  runtime.dispatch({ type: 'exit-replay' });
  const after = runtime.getSnapshot();
  expect(after.navigation.target).toBe('jupiter');
  expect(after.navigation.mode).toBe('orbit');
  expect(after.clock).toBe(before.clock);
  expect(length(sub(sub(after.navigation.positionKm, after.world.bodies.jupiter.positionKm), relative))).toBeLessThan(1e-5);
  expect(after.world.bodies.jupiter).toEqual(evaluateWorld(after.clock.julianDay).bodies.jupiter);
  runtime.dispose();
});

it('detects a reverse playback step across a source gap', async () => {
  const runtime = await ready();
  runtime.dispatch({ type: 'enter-replay' });
  runtime.dispatch({ type: 'set-date', julianDay: jd(data.segments[4]!.startUtcMs + 1000) });
  runtime.dispatch({ type: 'set-rate', rate: -10 });
  runtime.dispatch({ type: 'set-paused', paused: false });
  const frame = runtime.tick(1);
  expect(frame.replayActive).toBe(false);
  expect(frame.clock.paused).toBe(true);
  expect(frame.navigation.target).toBeNull();
  runtime.dispose();
});
