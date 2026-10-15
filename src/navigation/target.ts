import { isBodyId, type BodyId, type Catalog, type Vec3, type WorldSnapshot } from '../simulation/types';
import { isSpacecraftId, type SpacecraftId } from '../spacecraft/catalog';
import { SURFACE_FACTOR } from './flight-path';
import { visualRadius } from './framing';

export type NavigationTargetId = BodyId | SpacecraftId;
export interface ResolvedTarget {
  readonly id: NavigationTargetId;
  readonly positionKm: Vec3;
  readonly framingRadiusKm: number;
  readonly minimumDistanceKm: number;
  readonly obstacleId: BodyId | null;
}
export type SpacecraftTargets = Readonly<Partial<Record<SpacecraftId, ResolvedTarget>>>;

export function resolveTarget(id: NavigationTargetId, world: WorldSnapshot, catalog: Catalog, spacecraft: SpacecraftTargets = {}): ResolvedTarget {
  if (isBodyId(id)) return {
    id, positionKm: world.bodies[id].positionKm,
    framingRadiusKm: visualRadius(id, catalog[id].radiusKm),
    minimumDistanceKm: catalog[id].radiusKm * SURFACE_FACTOR * (1 + 1e-8), obstacleId: id,
  };
  const target = isSpacecraftId(id) ? spacecraft[id] : undefined;
  if (!target || target.id !== id || !target.positionKm.every(Number.isFinite)
    || !Number.isFinite(target.framingRadiusKm) || target.framingRadiusKm <= 0
    || !Number.isFinite(target.minimumDistanceKm) || target.minimumDistanceKm <= 0 || target.obstacleId !== null) {
    throw new Error('该航天器暂无可用轨迹或有效观察目标');
  }
  return target;
}
