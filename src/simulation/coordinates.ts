import type { Vec3 } from './types';
export const KM_PER_SCENE_UNIT = 1000;
export const AU_KM = 149597870.69098932;
export function toSceneDirection(v: Vec3): Vec3 { return [v[0], v[2], -v[1]]; }
export function fromSceneDirection(v: Vec3): Vec3 { return [v[0], -v[2], v[1]]; }
export function toRelativeScene(p: Vec3, origin: Vec3): Vec3 {
  return [(p[0] - origin[0]) / KM_PER_SCENE_UNIT, (p[2] - origin[2]) / KM_PER_SCENE_UNIT, -(p[1] - origin[1]) / KM_PER_SCENE_UNIT];
}
