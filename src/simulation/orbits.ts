import { Body, GeoMoon, HelioVector, RotateVector, Rotation_EQJ_ECL, type Vector } from 'astronomy-engine';
import { astronomyBodies } from './catalog';
import { AU_KM } from './coordinates';
import { assertValidDate } from './clock';
import type { BodyId, Vec3 } from './types';
import { add, scale, sub } from './vector';

const rotation = Rotation_EQJ_ECL();
function eclipticKm(vector: Vector): Vec3 {
  const v = RotateVector(rotation, vector);
  return [v.x * AU_KM, v.y * AU_KM, v.z * AU_KM];
}
/** Earth deliberately returns the Earth–Moon barycenter for plan compatibility. */
export function evaluatePlanet(id: Exclude<BodyId, 'sun' | 'moon'>, julianDay: number): Vec3 {
  assertValidDate(julianDay);
  return eclipticKm(HelioVector(id === 'earth' ? Body.EMB : astronomyBodies[id], julianDay - 2451545));
}
export function evaluateMoonRelative(julianDay: number): Vec3 {
  assertValidDate(julianDay);
  return eclipticKm(GeoMoon(julianDay - 2451545));
}
export function splitEarthMoon(barycenter: Vec3, moonRelative: Vec3, earthMassKg: number, moonMassKg: number): { earth: Vec3; moon: Vec3 } {
  if (!(earthMassKg > 0) || !(moonMassKg > 0) || !Number.isFinite(earthMassKg + moonMassKg)) throw new Error('Earth and Moon masses must be positive and finite');
  const earth = sub(barycenter, scale(moonRelative, moonMassKg / (earthMassKg + moonMassKg)));
  return { earth, moon: add(earth, moonRelative) };
}
/** Utility for elliptical previews; production ephemerides use Astronomy Engine. */
export function solveKepler(meanAnomalyRad: number, eccentricity: number): number {
  if (!Number.isFinite(meanAnomalyRad) || !Number.isFinite(eccentricity) || eccentricity < 0 || eccentricity >= 1) throw new Error('Invalid elliptic Kepler parameters');
  const cycles = Math.round(meanAnomalyRad / (2 * Math.PI));
  const mean = meanAnomalyRad - cycles * 2 * Math.PI;
  let anomaly = eccentricity < 0.8 ? mean : Math.sign(mean || 1) * Math.PI;
  for (let i = 0; i < 32; i++) {
    const residual = anomaly - eccentricity * Math.sin(anomaly) - mean;
    if (Math.abs(residual) < 1e-12) return anomaly + cycles * 2 * Math.PI;
    anomaly -= residual / (1 - eccentricity * Math.cos(anomaly));
  }
  throw new Error(`Kepler failed to converge: M=${meanAnomalyRad}, e=${eccentricity}`);
}
