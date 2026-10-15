import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRuntime } from './runtime';
import { advanceFrame } from './frame-driver';
import { EMPTY_INPUT } from '../navigation/controller';
import { length, sub } from '../simulation/vector';

describe('single renderer frame driver', () => {
  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 9, 14, 0, 55, 3));
  });
  afterEach(() => vi.restoreAllMocks());
  it('blocks held input while a modal is open and freezes ticks during context loss', () => {
    const runtime = createRuntime();
    runtime.dispatch({ type: 'set-paused', paused: true });
    const original = runtime.getSnapshot().navigation.positionKm;
    let cleared = 0;
    const input = {
      readInput: () => ({ ...EMPTY_INPUT, localMove: [0, 0, 1] as const }),
      clearInput: () => { cleared++; }, dispose() {},
    };
    // Orbit normalization can round heliocentric coordinates; 1e-7 km is 0.1 mm.
    const displacement = () => length(sub(runtime.getSnapshot().navigation.positionKm, original));
    advanceFrame(runtime, input, 1, false, false, false);
    expect(displacement()).toBeLessThan(1e-7);
    expect(cleared).toBe(1);
    const before = runtime.getSnapshot();
    advanceFrame(runtime, input, 100, true, true, false);
    expect(runtime.getSnapshot()).toBe(before);
    advanceFrame(runtime, input, 100, true, false, true);
    expect(displacement()).toBeLessThan(1e-7);
    advanceFrame(runtime, input, 1, true, false, false);
    expect(displacement()).toBeGreaterThan(1000);
    runtime.dispose();
  });
  it('forwards input before exactly one tick and does not double-advance time', () => {
    const runtime = createRuntime();
    const before = runtime.getSnapshot().clock.julianDay;
    advanceFrame(runtime, { readInput: () => EMPTY_INPUT, clearInput() {}, dispose() {} }, 1, true, false, false);
    expect((runtime.getSnapshot().clock.julianDay - before) * 86400).toBeCloseTo(1, 4);
    runtime.dispose();
  });
});
