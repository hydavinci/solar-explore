import { AU_KM, fromSceneDirection, toRelativeScene, toSceneDirection } from '../simulation/coordinates';
import { BODY_IDS, type BodyId, type Catalog, type ScaleMode, type Vec3, type WorldSnapshot } from '../simulation/types';
import { add, length, scale, sub } from '../simulation/vector';
export interface DisplayBody { readonly id: BodyId; readonly position: Vec3; readonly radius: number }
export type DisplayWorld = Readonly<Record<BodyId, DisplayBody>>;
export const DISPLAY_CONFIG = Object.freeze({ distanceScale: 30, radiusBase: 0.25, radiusScale: 0.2, sunRadius: 2, moonBase: 3, moonScale: 2, moonDistanceKm: 384400 });
export const schematicDistance = (km: number): number => DISPLAY_CONFIG.distanceScale * Math.log1p(km / AU_KM);
export function displayRadius(id: BodyId, catalog: Catalog, mode: ScaleMode): number {
  return mode === 'real' ? catalog[id].radiusKm / 1000 : id === 'sun' ? DISPLAY_CONFIG.sunRadius : DISPLAY_CONFIG.radiusBase + DISPLAY_CONFIG.radiusScale * Math.log1p(catalog[id].radiusKm / 1000);
}
/** Scene-axis absolute display position. Use the same function for orbit samples. */
export function mapPosition(id: BodyId, positionKm: Vec3, world: WorldSnapshot, catalog: Catalog, mode: ScaleMode): Vec3 {
  if (mode === 'real') return toRelativeScene(positionKm, [0, 0, 0]);
  const parent = catalog[id].parentId;
  if (!parent) return [0, 0, 0];
  const parentPhysical = world.bodies[parent].positionKm;
  const relative = sub(positionKm, parentPhysical);
  const distance = length(relative);
  const mappedDistance = id === 'moon' ? DISPLAY_CONFIG.moonBase + DISPLAY_CONFIG.moonScale * Math.log1p(distance / DISPLAY_CONFIG.moonDistanceKm) : schematicDistance(distance);
  const parentDisplay = mapPosition(parent, parentPhysical, world, catalog, mode);
  return distance === 0 ? parentDisplay : add(parentDisplay, toSceneDirection(scale(relative, mappedDistance / distance)));
}
export function mapWorld(world: WorldSnapshot, catalog: Catalog, mode: ScaleMode): DisplayWorld {
  return Object.fromEntries(BODY_IDS.map(id => [id, { id, position: mapPosition(id, world.bodies[id].positionKm, world, catalog, mode), radius: displayRadius(id, catalog, mode) }])) as Record<BodyId, DisplayBody>;
}
/** Pose stays physical. Target-relative mapping is intentional, not arbitrary nonlinear free-space mapping. */
export function mapCamera(positionKm: Vec3, target: BodyId | null, world: WorldSnapshot, catalog: Catalog, mode: ScaleMode): Vec3 {
  if (mode === 'real') return toRelativeScene(positionKm, [0, 0, 0]);
  if (!target) return [0, 100, 140];
  const center = mapPosition(target, world.bodies[target].positionKm, world, catalog, mode);
  return add(center, toSceneDirection(scale(sub(positionKm, world.bodies[target].positionKm), displayRadius(target, catalog, mode) / catalog[target].radiusKm)));
}
/** Inverse of the target-relative affine camera mapping, not an inverse planetary distance map. */
export function unmapCamera(position: Vec3, target: BodyId, world: WorldSnapshot, catalog: Catalog, mode: ScaleMode): Vec3 {
  if (mode === 'real') return scale(fromSceneDirection(position), 1000);
  const center = mapPosition(target, world.bodies[target].positionKm, world, catalog, mode);
  return add(world.bodies[target].positionKm, scale(fromSceneDirection(sub(position, center)), catalog[target].radiusKm / displayRadius(target, catalog, mode)));
}
/** Collision-only geometry in the active anchor's km units. Physical snapshots/catalog remain untouched. */
export function navigationGeometry(world: WorldSnapshot, catalog: Catalog, mode: ScaleMode, target: BodyId | null): { world: WorldSnapshot; catalog: Catalog } {
  if (mode === 'real' || target === null) return { world, catalog };
  const display = mapWorld(world, catalog, mode);
  const kmPerDisplayUnit = catalog[target].radiusKm / display[target].radius;
  const bodies = { ...world.bodies }, definitions = { ...catalog };
  for (const id of BODY_IDS) {
    bodies[id] = { ...world.bodies[id], positionKm: unmapCamera(display[id].position, target, world, catalog, mode) };
    definitions[id] = { ...catalog[id], radiusKm: display[id].radius * kmPerDisplayUnit };
  }
  return { world: { ...world, bodies }, catalog: definitions };
}
/** Avoid subtracting already-scaled large real positions; this is the rendering entry point. */
export function relativeDisplayPosition(id: BodyId, world: WorldSnapshot, catalog: Catalog, mode: ScaleMode, cameraKm: Vec3, target: BodyId | null): Vec3 {
  return mode === 'real' ? toRelativeScene(world.bodies[id].positionKm, cameraKm) : sub(mapPosition(id, world.bodies[id].positionKm, world, catalog, mode), mapCamera(cameraKm, target, world, catalog, mode));
}
