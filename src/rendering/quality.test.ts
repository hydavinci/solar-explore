import { expect, it } from 'vitest';
import { renderSize, summarizeFrameTimes } from './quality';

it('limits resolution independently of device pixel ratio', () => {
  const size = renderSize(3840, 2160, 2, 'standard');
  expect(size.width * size.height).toBeLessThanOrEqual(1920 * 1080);
  expect(size.width / size.height).toBeCloseTo(16 / 9, 2);
});
it('does not upscale small windows unnecessarily', () => {
  expect(renderSize(600, 400, 1, 'standard')).toEqual({ width: 600, height: 400 });
});
it('reports the actual tail rather than an average', () => {
  expect(summarizeFrameTimes([10, 10, 10, 10, 50])).toEqual({ medianMs: 10, p95Ms: 50 });
});
it('refuses empty performance evidence', () => {
  expect(() => summarizeFrameTimes([])).toThrow();
});
