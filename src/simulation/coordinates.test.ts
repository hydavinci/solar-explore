import { describe, expect, it } from 'vitest';
import { toRelativeScene, toSceneDirection } from './coordinates';
import { add, sub, scale, dot, cross, length, normalize } from './vector';

describe('physical vectors and render coordinates', () => {
  it('subtracts the camera origin before scaling and maps a right-handed frame', () => {
    expect(toRelativeScene([4e9 + 2, 3, 4], [4e9, 0, 0])).toEqual([0.002, 0.004, -0.003]);
    expect(toSceneDirection([1, 2, 3])).toEqual([1, 3, -2]);
  });
  it('performs vector arithmetic without changing readonly inputs', () => {
    const a = [1, 2, 3] as const;
    expect(add(a, [3, 2, 1])).toEqual([4, 4, 4]);
    expect(sub(a, [3, 2, 1])).toEqual([-2, 0, 2]);
    expect(scale(a, 2)).toEqual([2, 4, 6]);
    expect(dot(a, [3, 2, 1])).toBe(10);
    expect(cross([1, 0, 0], [0, 1, 0])).toEqual([0, 0, 1]);
    expect(length([3, 4, 0])).toBe(5);
    expect(normalize([3, 0, 0])).toEqual([1, 0, 0]);
    expect(() => normalize([0, 0, 0])).toThrow();
    expect(a).toEqual([1, 2, 3]);
  });
});
