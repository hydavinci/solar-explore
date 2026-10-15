import { BODY_IDS, type BodyId, type Catalog, type Vec3, type WorldSnapshot } from '../simulation/types';
import { add, cross, dot, length, lerp, normalize, scale, sub } from '../simulation/vector';
export const SURFACE_FACTOR = 1.01;
export function segmentClearsSphere(a: Vec3, b: Vec3, center: Vec3, radius: number): boolean {
  const direction = sub(b, a);
  const squared = dot(direction, direction);
  const t = squared === 0 ? 0 : Math.max(0, Math.min(1, dot(sub(center, a), direction) / squared));
  return length(sub(lerp(a, b, t), center)) >= radius;
}
export function projectOutside(position: Vec3, world: WorldSnapshot, catalog: Catalog): Vec3 {
  let result = position;
  for (let pass = 0; pass < 10; pass++) {
    let adjusted = false;
    for (const id of BODY_IDS) {
      const center = world.bodies[id].positionKm;
      const offset = sub(result, center), distance = length(offset);
      const safe = catalog[id].radiusKm * SURFACE_FACTOR;
      if (distance < safe) {
        result = add(center, scale(distance === 0 ? [0, 0, 1] : normalize(offset), safe * (1 + 1e-8)));
        adjusted = true;
      }
    }
    if (!adjusted) return result;
  }
  throw new Error('无法找到天体表面之外的安全相机位置');
}
export function clipMovement(start: Vec3, end: Vec3, world: WorldSnapshot, catalog: Catalog, excluded?: BodyId, inflationKm = 0): Vec3 {
  const delta = sub(end, start), a = dot(delta, delta);
  if (a === 0) return start;
  let stop = 1;
  for (const id of BODY_IDS) {
    if (id === excluded) continue;
    const center = world.bodies[id].positionKm, radius = catalog[id].radiusKm * SURFACE_FACTOR + inflationKm;
    if (segmentClearsSphere(start, end, center, radius)) continue;
    const offset = sub(start, center);
    const b = dot(offset, delta), c = dot(offset, offset) - radius ** 2;
    const discriminant = b * b - a * c;
    if (discriminant >= 0) {
      const entry = (-b - Math.sqrt(discriminant)) / a;
      if (entry >= 0 && entry <= 1) stop = Math.min(stop, Math.max(0, entry - Math.max(1e-12, radius * 1e-8 / Math.sqrt(a))));
      else if (c < 0) stop = 0;
    }
  }
  return lerp(start, end, stop);
}
export function planFlight(start: Vec3, end: Vec3, world: WorldSnapshot, catalog: Catalog): { ok: true; points: readonly Vec3[] } | { ok: false; message: string } {
  if (![...start, ...end].every(Number.isFinite)) return { ok: false, message: '飞行端点无效' };
  for (const id of BODY_IDS) {
    const center = world.bodies[id].positionKm, r = catalog[id].radiusKm * SURFACE_FACTOR;
    if (length(sub(start, center)) < r || length(sub(end, center)) < r) return { ok: false, message: `飞行端点位于${catalog[id].nameZh}安全表面内` };
  }
  const points: Vec3[] = [start, end];
  for (let attempt = 0; attempt < 32; attempt++) {
    let blocked = false;
    for (let index = 1; index < points.length; index++) {
      const a = points[index - 1]!, b = points[index]!;
      const obstacle = BODY_IDS.find(id => !segmentClearsSphere(a, b, world.bodies[id].positionKm, catalog[id].radiusKm * SURFACE_FACTOR));
      if (!obstacle) continue;
      blocked = true;
      const center = world.bodies[obstacle].positionKm, radius = catalog[obstacle].radiusKm * SURFACE_FACTOR;
      const direction = normalize(sub(b, a));
      const side = normalize(cross(direction, Math.abs(direction[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0]));
      let detour: Vec3[] | null = null;
      for (let round = 0; round < 8 && !detour; round++) {
        for (const sign of [1, -1]) {
          const lateral = scale(side, sign * radius * 2 ** (round + 1));
          const left = add(add(center, scale(direction, -radius * 1.2)), lateral);
          const right = add(add(center, scale(direction, radius * 1.2)), lateral);
          const candidate = [a, left, right, b];
          if (candidate.slice(1).every((point, i) => segmentClearsSphere(candidate[i]!, point, center, radius))) {
            detour = [left, right]; break;
          }
        }
      }
      if (!detour) return { ok: false, message: `无法安全绕过${catalog[obstacle].nameZh}，请调整视角后重试` };
      points.splice(index, 0, ...detour);
      break;
    }
    if (!blocked) return { ok: true, points };
  }
  return { ok: false, message: '无法找到通过所有天体安全检查的飞行路径，请调整视角后重试' };
}
export function pointAlongPath(points: readonly Vec3[], fraction: number): Vec3 {
  if (points.length === 0) throw new Error('Empty flight path');
  const distances = points.slice(1).map((point, i) => length(sub(point, points[i]!)));
  let distance = distances.reduce((a, b) => a + b, 0) * Math.max(0, Math.min(1, fraction));
  for (let i = 0; i < distances.length; i++) {
    const segment = distances[i]!;
    if (distance <= segment && segment > 0) return lerp(points[i]!, points[i + 1]!, distance / segment);
    distance -= segment;
  }
  return points[points.length - 1]!;
}
