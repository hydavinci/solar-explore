import { catalog } from './catalog';
import { assertValidDate } from './clock';
import { evaluateMoonRelative, evaluatePlanet, splitEarthMoon } from './orbits';
import { evaluateSpin } from './rotation';
import { BODY_IDS, type BodyId, type BodyState, type Vec3, type WorldSnapshot } from './types';
export function evaluateWorld(julianDay: number): WorldSnapshot {
  assertValidDate(julianDay);
  const pair = splitEarthMoon(evaluatePlanet('earth', julianDay), evaluateMoonRelative(julianDay), catalog.earth.massKg, catalog.moon.massKg);
  const bodies = Object.fromEntries(BODY_IDS.map(id => {
    const positionKm: Vec3 = id === 'sun' ? [0, 0, 0] : id === 'earth' ? pair.earth : id === 'moon' ? pair.moon : evaluatePlanet(id, julianDay);
    return [id, Object.freeze({ id, positionKm: Object.freeze(positionKm), spinRad: evaluateSpin(catalog[id], julianDay) })];
  })) as Record<BodyId, BodyState>;
  return Object.freeze({ julianDay, bodies: Object.freeze(bodies) });
}
