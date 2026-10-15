import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachGraphicsRecovery } from './graphics-recovery';

afterEach(() => vi.useRealTimers());
describe('graphics recovery lifetime', () => {
  it('prevents permanent loss, suspends updates, restores resources and resumes without catchup', () => {
    vi.useFakeTimers();
    const canvas = new EventTarget();
    const states: string[] = [];
    let restored = 0;
    const recovery = attachGraphicsRecovery(canvas, s => states.push(s), () => { restored++; });
    const event = new Event('webglcontextlost', { cancelable: true });
    canvas.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(recovery.suspended()).toBe(true);
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    expect(restored).toBe(1);
    expect(recovery.suspended()).toBe(false);
    expect(recovery.consumeResume()).toBe(true);
    expect(recovery.consumeResume()).toBe(false);
    vi.advanceTimersByTime(10_001);
    expect(states).toEqual(['lost', 'ready']);
    recovery.dispose();
  });
  it('offers reload after ten seconds, and removes listeners and timeout on disposal', () => {
    vi.useFakeTimers();
    const canvas = new EventTarget(), states: string[] = [];
    const recovery = attachGraphicsRecovery(canvas, s => states.push(s), () => {});
    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    vi.advanceTimersByTime(10_000);
    expect(states).toEqual(['lost', 'failed']);
    recovery.dispose();
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    expect(states).toEqual(['lost', 'failed']);
  });
  it('preserves the actual GPU rebuild exception for the visible error callback', () => {
    const canvas = new EventTarget(), errors: unknown[] = [];
    const failure = new Error('texture upload rejected');
    const recovery = attachGraphicsRecovery(canvas, (_state, error) => { if (error) errors.push(error); }, () => { throw failure; });
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    expect(errors).toEqual([failure]);
    expect(recovery.suspended()).toBe(true);
    recovery.dispose();
  });
});
