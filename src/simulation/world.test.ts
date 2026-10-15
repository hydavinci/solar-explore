import { describe, expect, it } from 'vitest';
import { catalog } from './catalog';
import { evaluateWorld } from './world';
import { evaluatePlanet, evaluateMoonRelative, splitEarthMoon, solveKepler } from './orbits';
import { evaluateSpin } from './rotation';
import { length, sub } from './vector';
import { MIN_JD, MAX_JD } from './clock';

describe('absolute-time astronomy', () => {
  it('has ten sourced bodies and signed, coherent rotation', () => {
    expect(Object.keys(catalog)).toHaveLength(10);
    expect(catalog.venus.rotationPeriodDays).toBeLessThan(0);
    expect(catalog.uranus.rotationPeriodDays).toBeLessThan(0);
    expect(catalog.venus.axialTiltRad).toBeLessThan(Math.PI / 2);
    expect(catalog.uranus.axialTiltRad).toBeLessThan(Math.PI / 2);
    expect(evaluateSpin(catalog.venus, 2451545.1)).toBeLessThan(evaluateSpin(catalog.venus, 2451545));
  });
  it('uses ecliptic J2000 rather than equatorial coordinates', () => {
    const earth = evaluateWorld(2451545).bodies.earth.positionKm;
    expect(earth[0]).toBeGreaterThan(-2.8e7);
    expect(earth[0]).toBeLessThan(-2.5e7);
    expect(earth[1]).toBeGreaterThan(1.4e8);
    expect(Math.abs(earth[2])).toBeLessThan(10000);
  });
  it.each([MIN_JD, 2451545, 2461326.5, MAX_JD - 1])('is deterministic and physically plausible at JD %s', jd => {
    const world = evaluateWorld(jd);
    const again = evaluateWorld(jd);
    expect(again).toEqual(world);
    expect(length(world.bodies.earth.positionKm)).toBeGreaterThan(1.46e8);
    expect(length(world.bodies.earth.positionKm)).toBeLessThan(1.53e8);
    expect(length(world.bodies.neptune.positionKm)).toBeGreaterThan(4.4e9);
    expect(length(world.bodies.neptune.positionKm)).toBeLessThan(4.6e9);
    const lunar = length(sub(world.bodies.moon.positionKm, world.bodies.earth.positionKm));
    expect(lunar).toBeGreaterThan(3.5e5);
    expect(lunar).toBeLessThan(4.1e5);
    expect(world.bodies.sun.positionKm).toEqual([0, 0, 0]);
  });
  it('splits the EMB and Moon with conservation of mass and a common frame', () => {
    const split = splitEarthMoon([100, 0, 0], [10, 0, 0], 9, 1);
    expect(split).toEqual({ earth: [99, 0, 0], moon: [109, 0, 0] });
    const jd = 2451545;
    const world = evaluateWorld(jd);
    const emb = evaluatePlanet('earth', jd);
    const relative = evaluateMoonRelative(jd);
    const result = splitEarthMoon(emb, relative, catalog.earth.massKg, catalog.moon.massKg);
    expect(length(sub(result.earth, world.bodies.earth.positionKm))).toBeLessThan(0.001);
    expect(length(sub(result.moon, world.bodies.moon.positionKm))).toBeLessThan(0.001);
  });
  it('solves elliptic Kepler and rejects dates outside the application interval', () => {
    for (const eccentricity of [0, 0.2, 0.99]) {
      const eccentricAnomaly = solveKepler(1.2, eccentricity);
      expect(Math.abs(eccentricAnomaly - eccentricity * Math.sin(eccentricAnomaly) - 1.2)).toBeLessThan(1e-10);
    }
    expect(() => solveKepler(1, 1)).toThrow();
    expect(() => evaluateWorld(MAX_JD)).toThrow();
    expect(() => evaluateWorld(NaN)).toThrow();
  });
});
