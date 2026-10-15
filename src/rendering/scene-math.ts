import { PerspectiveCamera, Vector3 } from 'three';
import { toSceneDirection } from '../simulation/coordinates';
import type { Vec3 } from '../simulation/types';
import { renderSize, type Quality } from './quality';

export function cappedPixelRatio(width: number, height: number, dpr: number, quality: Quality) {
  if (width <= 0 || height <= 0) return 1;
  const capped = renderSize(width, height, dpr, quality);
  return Math.min(capped.width / width, capped.height / height);
}
export function lightDirection(bodyKm: Vec3, sunKm: Vec3): Vec3 {
  const x = sunKm[0] - bodyKm[0], y = sunKm[1] - bodyKm[1], z = sunKm[2] - bodyKm[2];
  const length = Math.hypot(x, y, z) || 1;
  return toSceneDirection([x / length, y / length, z / length]);
}
const projected = new Vector3();
export function labelProjection(position: Vector3, camera: PerspectiveCamera, width: number, height: number) {
  projected.copy(position).project(camera);
  return { x: (projected.x + 1) * width / 2, y: (1 - projected.y) * height / 2,
    visible: projected.z >= -1 && projected.z <= 1 && Math.abs(projected.x) < 0.98 && Math.abs(projected.y) < 0.95 };
}
export function isOccluded(position: Vector3, spheres: readonly { center: Vector3; radius: number }[]) {
  const distance = position.length();
  if (!distance) return true;
  for (const sphere of spheres) {
    const along = sphere.center.dot(position) / distance;
    if (along <= 0 || along >= distance) continue;
    const perpendicularSq = sphere.center.lengthSq() - along * along;
    if (perpendicularSq < sphere.radius ** 2 && along - Math.sqrt(sphere.radius ** 2 - perpendicularSq) < distance) return true;
  }
  return false;
}
export function radialRingUv(x: number, y: number, inner: number, outer: number): [number, number] {
  return [Math.max(0, Math.min(1, (Math.hypot(x, y) - inner) / (outer - inner))), 0.5];
}
export function seededStars(count: number, seed = 0x501a2026) {
  const positions = new Float32Array(count * 3);
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < count; i++) {
    const z = random() * 2 - 1, angle = random() * Math.PI * 2, radial = Math.sqrt(1 - z * z);
    positions.set([Math.cos(angle) * radial * 50, z * 50, Math.sin(angle) * radial * 50], i * 3);
  }
  return positions;
}
