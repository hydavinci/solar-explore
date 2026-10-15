import { describe, expect, it } from 'vitest';
import { formatDistance, formatRate } from './format';

describe('physical unit labels', () => {
  it('switches to astronomical units for interplanetary distances', () => {
    expect(formatDistance(149_597_870.7)).toBe('1.000 AU');
    expect(formatDistance(6371)).toBe('6,371 km');
  });
  it('preserves the direction of reversed time', () => {
    expect(formatRate(-86400)).toContain('−');
    expect(formatRate(1)).toBe('实时');
  });
});
