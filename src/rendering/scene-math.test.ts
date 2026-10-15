import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { lightDirection, labelProjection, isOccluded, radialRingUv, seededStars, cappedPixelRatio } from './scene-math';

describe('render coordinate and projection contract', () => {
  it('supplies a persistent Canvas DPR under the low and standard pixel budgets on retina', () => {
    for (const [quality, budget] of [['low', 921600], ['standard', 2073600]] as const) {
      for (const [width, height] of [[1440, 900], [3840, 2160], [1080, 1920]]) {
        const dpr = cappedPixelRatio(width!, height!, 2, quality);
        expect(Math.floor(width! * dpr) * Math.floor(height! * dpr)).toBeLessThanOrEqual(budget);
        expect(dpr).toBeGreaterThan(0);
      }
    }
    expect(cappedPixelRatio(0, 0, 2, 'low')).toBe(1);
  });
  it('points surface lighting toward the Sun in scene axes, not physical axes', () => {
    expect(lightDirection([10, 0, 0], [0, 0, 0])).toEqual([-1, 0, -0]);
    expect(lightDirection([0, 0, -5], [0, 0, 0])).toEqual([0, 1, -0]);
  });
  it('projects the camera center and rejects behind-camera and offscreen labels', () => {
    const camera = new PerspectiveCamera(60, 2, 0.01, 1000);
    camera.updateMatrixWorld();
    const p = labelProjection(new Vector3(0, 0, -10), camera, 1000, 500);
    expect(p).toEqual({ x: 500, y: 250, visible: true });
    expect(labelProjection(new Vector3(0, 0, 10), camera, 1000, 500).visible).toBe(false);
    expect(labelProjection(new Vector3(100, 0, -10), camera, 1000, 500).visible).toBe(false);
  });
  it('hides a distant label behind a nearer sphere but not beside or in front of it', () => {
    const sphere = { center: new Vector3(0, 0, -10), radius: 2 };
    expect(isOccluded(new Vector3(0, 0, -20), [sphere])).toBe(true);
    expect(isOccluded(new Vector3(5, 0, -10), [sphere])).toBe(false);
    expect(isOccluded(new Vector3(0, 0, -5), [sphere])).toBe(false);
  });
  it('maps the Saturn strip along radius at every azimuth', () => {
    expect(radialRingUv(1, 0, 1, 3)).toEqual([0, 0.5]);
    expect(radialRingUv(0, -3, 1, 3)).toEqual([1, 0.5]);
    expect(radialRingUv(0, 2, 1, 3)).toEqual([0.5, 0.5]);
  });
  it('keeps star positions deterministic and on their independent background sphere', () => {
    const stars = seededStars(32);
    expect(stars).toEqual(seededStars(32));
    expect(stars).not.toEqual(seededStars(32, 7));
    for (let i = 0; i < stars.length; i += 3) {
      expect(Math.hypot(stars[i]!, stars[i + 1]!, stars[i + 2]!)).toBeCloseTo(50, 4);
    }
  });
});
