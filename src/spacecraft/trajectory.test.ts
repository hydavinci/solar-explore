import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import reference from './voyager1-reference.json';
import manifest from './voyager1-manifest.json';
import { decodeTrajectory, loadTrajectory, sampleTrajectory, utcMilliseconds } from './trajectory';

const text = readFileSync(new URL('../../public/trajectories/voyager-1-jupiter-1979.json', import.meta.url), 'utf8');
const raw: unknown = JSON.parse(text);

describe('archived trajectory', () => {
  it('reproduces held-out spacecraft and Jupiter source positions', () => {
    const data = decodeTrajectory(raw);
    for (const row of reference.samples) {
      const state = sampleTrajectory(data, row[0]!);
      expect(state).not.toBeNull();
      expect(Math.hypot(...state!.spacecraft.positionKm.map((v, i) => v - row[i + 1]!))).toBeLessThanOrEqual(1);
      expect(Math.hypot(...state!.jupiter.positionKm.map((v, i) => v - row[i + 7]!))).toBeLessThanOrEqual(1);
    }
  });

  it('preserves exact endpoints and refuses all guarded gaps and extrapolation', () => {
    const data = decodeTrajectory(raw);
    for (const [i, segment] of data.segments.entries()) {
      for (const row of [segment.samples[0]!, segment.samples.at(-1)!]) {
        expect(sampleTrajectory(data, row[0])?.spacecraft.positionKm).toEqual(row.slice(1, 4));
      }
      expect(sampleTrajectory(data, segment.startUtcMs - 0.25)).toBeNull();
      expect(sampleTrajectory(data, segment.endUtcMs + 0.25)).toBeNull();
      const next = data.segments[i + 1];
      if (next) expect(sampleTrajectory(data, (segment.endUtcMs + next.startUtcMs) / 2)).toBeNull();
    }
    expect(() => sampleTrajectory(data, NaN)).toThrow();
  });

  it('queries by absolute UTC time with no forward-only cache or accumulated state', () => {
    const data = decodeTrajectory(raw);
    const utc = Date.parse('1979-03-05T12:05:00Z');
    const first = sampleTrajectory(data, utc);
    sampleTrajectory(data, utc + 86400000);
    expect(sampleTrajectory(data, utc)).toEqual(first);
    sampleTrajectory(data, utc - 86400000);
    expect(sampleTrajectory(data, utc)).toEqual(first);
    expect(utcMilliseconds(2443937.5)).toBe(Date.parse('1979-03-05T00:00:00Z'));
    expect(() => utcMilliseconds(Infinity)).toThrow();
  });

  it('rejects wrong frames, units, versions and malformed metadata', () => {
    const data = decodeTrajectory(raw);
    for (const invalid of [
      null, [], { ...data, frame: 'J2000' }, { ...data, center: 'SSB' },
      { ...data, timeScale: 'TDB' }, { ...data, positionUnit: 'AU' },
      { ...data, velocityUnit: 'km/day' }, { ...data, schemaVersion: 2 },
      { ...data, spacecraftId: 'voyager-2' }, { ...data, segments: [] },
    ]) expect(() => decodeTrajectory(invalid)).toThrow();
  });

  it('rejects nonfinite, incomplete, unordered and overlapping sample intervals', () => {
    const data = decodeTrajectory(raw), first = data.segments[0]!;
    const badSegments = [
      { ...first, samples: [first.samples[0]] },
      { ...first, samples: [...first.samples].reverse() },
      { ...first, samples: [[first.startUtcMs, NaN], ...first.samples.slice(1)] },
      { ...first, samples: [[first.startUtcMs, ...Array(12).fill(Infinity)], ...first.samples.slice(1)] },
      { ...first, startUtcMs: first.startUtcMs - 1 },
      { ...first, endUtcMs: first.endUtcMs + 1 },
    ];
    for (const segment of badSegments) {
      expect(() => decodeTrajectory({ ...data, segments: [segment, ...data.segments.slice(1)] })).toThrow();
    }
    expect(() => decodeTrajectory({ ...data, segments: [first, first] })).toThrow();
  });

  it('loads the pinned bytes and rejects an HTTP failure or altered payload', async () => {
    const signal = new AbortController().signal;
    const loaded = await loadTrajectory(signal, async () => new Response(text));
    expect(loaded.segments.map(s => [s.startUtcMs, s.endUtcMs])).toEqual(manifest.coverage);
    await expect(loadTrajectory(signal, async () => new Response('unavailable', { status: 503 }))).rejects.toThrow(/503/);
    await expect(loadTrajectory(signal, async () => new Response(text.replace('ECLIPJ2000', 'ECLIPJ2001')))).rejects.toThrow(/SHA-256/);
  });

  it('loads the trajectory under the configured deployment base rather than the domain root', async () => {
    const fetcher: typeof fetch = async url => url === '/solar/trajectories/voyager-1-jupiter-1979.json'
      ? new Response(text) : new Response('not found', { status: 404 });
    const loaded = await loadTrajectory(new AbortController().signal, fetcher, '/solar/');
    expect(loaded.spacecraftId).toBe('voyager-1');
  });
});
