import { Body, MassProduct, RotateVector, RotationAxis, Rotation_EQJ_ECL } from 'astronomy-engine';
import { BODY_IDS, type BodyId, type BodyDefinition, type Catalog } from './types';
import { AU_KM } from './coordinates';

export const astronomyBodies: Readonly<Record<BodyId, Body>> = {
  sun: Body.Sun, mercury: Body.Mercury, venus: Body.Venus, earth: Body.Earth, moon: Body.Moon,
  mars: Body.Mars, jupiter: Body.Jupiter, saturn: Body.Saturn, uranus: Body.Uranus, neptune: Body.Neptune,
};
const names: Record<BodyId, readonly [string, string]> = {
  sun: ['太阳', 'Sun'], mercury: ['水星', 'Mercury'], venus: ['金星', 'Venus'], earth: ['地球', 'Earth'],
  moon: ['月球', 'Moon'], mars: ['火星', 'Mars'], jupiter: ['木星', 'Jupiter'], saturn: ['土星', 'Saturn'],
  uranus: ['天王星', 'Uranus'], neptune: ['海王星', 'Neptune'],
};
// Four radii inferred from published angular semidiameters; see docs/data-sources.md.
const angularRadiusKm = (arcseconds: number): number => AU_KM * Math.tan(arcseconds * Math.PI / 648000);
const radii: Record<BodyId, number> = {
  sun: 695700, mercury: 2439.7, venus: 6051.8, earth: 6371, moon: 1737.4,
  mars: angularRadiusKm(4.68), jupiter: 69911, saturn: angularRadiusKm(82.73),
  uranus: angularRadiusKm(35.02), neptune: angularRadiusKm(33.50),
};
export const catalog: Catalog = Object.freeze(Object.fromEntries(BODY_IDS.map(id => {
  const body = astronomyBodies[id];
  const axis = RotationAxis(body, 0);
  const north = RotateVector(Rotation_EQJ_ECL(), axis.north);
  const definition: BodyDefinition = {
    id, parentId: id === 'sun' ? null : id === 'moon' ? 'earth' : 'sun',
    nameZh: names[id][0], nameEn: names[id][1], radiusKm: radii[id],
    massKg: MassProduct(body) * AU_KM ** 3 / 86400 ** 2 / 6.67430e-20,
    rotationPeriodDays: 360 / (RotationAxis(body, 1).spin - axis.spin),
    axialTiltRad: Math.acos(Math.max(-1, Math.min(1, north.z))),
    rotationEpochJd: 2451545, rotationPhaseRad: axis.spin * Math.PI / 180,
    northPole: Object.freeze([north.x, north.y, north.z] as const),
    source: 'docs/data-sources.md',
  };
  return [id, Object.freeze(definition)];
})) as Record<BodyId, BodyDefinition>);
