import type { Vec3 } from './types';
export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (v: Vec3, n: number): Vec3 => [v[0] * n, v[1] * n, v[2] * n];
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const length = (v: Vec3): number => Math.hypot(...v);
export function normalize(v: Vec3): Vec3 {
  const magnitude = length(v);
  if (!Number.isFinite(magnitude) || magnitude === 0) throw new Error('Cannot normalize a zero or non-finite vector');
  return scale(v, 1 / magnitude);
}
export const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => add(a, scale(sub(b, a), t));
export function rotate(v: Vec3, axis: Vec3, angle: number): Vec3 {
  const n = normalize(axis);
  return add(add(scale(v, Math.cos(angle)), scale(cross(n, v), Math.sin(angle))), scale(n, dot(n, v) * (1 - Math.cos(angle))));
}
