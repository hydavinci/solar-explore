import { describe, expect, it } from 'vitest';
import { advanceClock, parseUtcDate, toUtcIso, MIN_JD, MAX_JD } from './clock';

const clock = { julianDay: 2451545, rate: 86400, paused: false, hidden: false };
describe('UTC clock', () => {
  it('advances forward and backward independently of frame rate', () => {
    expect(advanceClock(clock, 1).state.julianDay).toBe(2451546);
    expect(advanceClock({ ...clock, rate: -86400 }, 1).state.julianDay).toBe(2451544);
    expect(advanceClock({ ...clock, paused: true }, 10).state.julianDay).toBe(2451545);
    expect(advanceClock({ ...clock, hidden: true }, 1000).state.julianDay).toBe(2451545);
  });
  it('round-trips UTC without accepting normalized invalid dates or local timezone offsets', () => {
    expect(parseUtcDate('2000-01-01T12:00:00Z')).toEqual({ ok: true, julianDay: 2451545 });
    expect(toUtcIso(2451545)).toBe('2000-01-01T12:00:00.000Z');
    for (const date of ['2026-02-30', '1900-02-29', '2026-13-01', '2026-01-01T24:00', '2026-01-01T00:00+08:00', '', '2050-01-01', '1799-12-31']) {
      expect(parseUtcDate(date).ok, date).toBe(false);
    }
    expect(parseUtcDate('2000-02-29').ok).toBe(true);
    expect(parseUtcDate('2026-10-13T19:50').ok).toBe(true);
    expect(parseUtcDate('1800-01-01')).toEqual({ ok: true, julianDay: MIN_JD });
  });
  it('pauses at the inclusive minimum and last valid millisecond', () => {
    const high = advanceClock({ ...clock, julianDay: MAX_JD - 0.1 }, 1);
    expect(high.boundaryReached).toBe(true);
    expect(high.state.paused).toBe(true);
    expect(toUtcIso(high.state.julianDay)).toBe('2049-12-31T23:59:59.999Z');
    const low = advanceClock({ ...clock, julianDay: MIN_JD, rate: -1 }, 1);
    expect(low.state.julianDay).toBe(MIN_JD);
    expect(low.state.paused).toBe(true);
  });
  it('rejects invalid delta/rate without altering state', () => {
    expect(() => advanceClock(clock, -1)).toThrow();
    expect(() => advanceClock({ ...clock, rate: Infinity }, 1)).toThrow();
    expect(() => advanceClock(clock, NaN)).toThrow();
    expect(clock.julianDay).toBe(2451545);
  });
});
