import {
  Box3, BoxGeometry, CylinderGeometry, DoubleSide, Group, LatheGeometry,
  Mesh, MeshStandardMaterial, Sphere, Vector2,
} from 'three';
import type { Vec3 } from '../simulation/types';
import type { SpacecraftModelKind } from './catalog';

export interface SpacecraftModel {
  readonly root: Group;
  dispose(): void;
}
interface Part {
  shape: 'box' | 'cylinder' | 'dish';
  position: Vec3;
  scale: Vec3;
  rotation?: Vec3;
  color: number;
  segments?: number;
}
const GOLD = 0xc8a15c, SILVER = 0xbcc7d2, DARK = 0x303c4a, BLUE = 0x204c83;
const box = (position: Vec3, scale: Vec3, color = GOLD, rotation?: Vec3): Part =>
  ({ shape: 'box', position, scale, color, rotation });
const cylinder = (position: Vec3, scale: Vec3, color = DARK, rotation?: Vec3, segments = 16): Part =>
  ({ shape: 'cylinder', position, scale, color, rotation, segments });
function antenna(y: number, radius: number): Part[] {
  return [
    { shape: 'dish', position: [0, y, 0], scale: [radius, radius, radius], color: 0xe4e8e9 },
    cylinder([0, y + radius * 0.26, 0], [0.018, radius * 0.52, 0.018], SILVER),
    cylinder([0, y + radius * 0.52, 0], [radius * 0.075, radius * 0.12, radius * 0.075], GOLD),
  ];
}
function solarWing(angle: number, length = 2.6, width = 0.8): Part[] {
  const offset = 0.65, parts: Part[] = [box([offset + length / 2, 0, 0], [length, 0.045, width], SILVER)];
  for (let column = 0; column < 8; column++) for (let row = 0; row < 2; row++) {
    parts.push(box([offset + (column + 0.5) * length / 8, 0.028, (row - 0.5) * width / 2],
      [length / 8 - 0.025, 0.02, width / 2 - 0.025], (column + row) % 2 ? BLUE : 0x295f9c));
  }
  return parts.map(part => ({
    ...part, rotation: [0, angle, 0],
    position: [
      part.position[0] * Math.cos(angle) + part.position[2] * Math.sin(angle),
      part.position[1],
      -part.position[0] * Math.sin(angle) + part.position[2] * Math.cos(angle),
    ],
  }));
}
function partsFor(kind: SpacecraftModelKind): Part[] {
  switch (kind) {
    case 'voyager': return [
      cylinder([0, 0, 0], [0.52, 0.48, 0.52], GOLD, undefined, 10), ...antenna(0.34, 1),
      box([-1.4, -0.05, 0], [2, 0.05, 0.05], SILVER),
      box([-2.45, -0.05, 0], [0.28, 0.2, 0.28], DARK),
      box([0, 0, -1.1], [0.06, 0.06, 1.8], SILVER),
      box([0, 0, -2], [0.48, 0.22, 0.3], DARK),
      cylinder([0.18, 0, -2.15], [0.09, 0.28, 0.09], SILVER, [Math.PI / 2, 0, 0]),
      box([1.25, -0.25, 0], [1.6, 0.065, 0.065], SILVER),
      ...[1.75, 2.17, 2.59].map(x => cylinder([x, -0.25, 0], [0.18, 0.36, 0.18], DARK, [0, 0, Math.PI / 2])),
      box([0, -0.85, 0.65], [0.025, 1.65, 0.025], SILVER, [-0.6, 0, 0.7]),
      box([0, -0.85, -0.65], [0.025, 1.65, 0.025], SILVER, [0.6, 0, -0.7]),
    ];
    case 'cassini': return [
      cylinder([0, 0, 0], [0.56, 1.85, 0.56], GOLD, undefined, 12),
      box([0, -0.16, 0.53], [0.66, 0.82, 0.12], 0xe0b46e),
      cylinder([0, 1.01, 0], [0.38, 0.2, 0.38], DARK), ...antenna(1.1, 1.04),
      box([0.75, 0.25, 0], [0.48, 0.45, 0.5], DARK),
      cylinder([0.9, 0.3, 0.32], [0.12, 0.32, 0.12], SILVER, [Math.PI / 2, 0, 0]),
      cylinder([-0.72, -0.67, 0], [0.2, 0.8, 0.2], DARK),
      cylinder([0, -0.72, -0.67], [0.2, 0.8, 0.2], DARK),
      cylinder([0, -1.12, 0], [0.25, 0.4, 0.25], SILVER),
      box([-0.38, -0.93, 0.36], [0.045, 0.85, 0.045], SILVER, [0, 0, -0.25]),
      box([0.38, -0.93, 0.36], [0.045, 0.85, 0.045], SILVER, [0, 0, 0.25]),
    ];
    case 'juno': return [
      cylinder([0, 0.05, 0], [0.58, 0.7, 0.58], GOLD, undefined, 6),
      ...antenna(0.44, 0.46),
      ...[0, Math.PI * 2 / 3, Math.PI * 4 / 3].flatMap(angle => solarWing(angle)),
      box([3.55, 0, 0], [0.65, 0.055, 0.055], SILVER),
      box([3.9, 0, 0], [0.15, 0.15, 0.15], DARK),
    ];
    case 'new-horizons': return [
      cylinder([0, 0, 0], [1.1, 0.5, 1.2], GOLD, [0, -Math.PI / 2, 0], 3),
      ...antenna(0.3, 0.84),
      box([0.65, 0.05, 0.56], [0.4, 0.35, 0.3], DARK),
      cylinder([0.6, 0.2, 0.55], [0.13, 0.5, 0.13], SILVER),
      box([1.05, -0.05, 0], [0.5, 0.12, 0.12], SILVER),
      cylinder([1.48, -0.05, 0], [0.23, 0.75, 0.23], DARK, [0, 0, Math.PI / 2]),
      ...[1.18, 1.38, 1.58, 1.78].map(x => cylinder([x, -0.05, 0], [0.29, 0.035, 0.29], SILVER, [0, 0, Math.PI / 2])),
    ];
    case 'tianwen-orbiter': return [
      box([0, 0, 0], [1.05, 1.2, 0.9]),
      box([0, 0.61, 0], [0.8, 0.04, 0.65], SILVER),
      ...antenna(0.68, 0.6), ...solarWing(0, 2.25, 1.05), ...solarWing(Math.PI, 2.25, 1.05),
      cylinder([0, -0.7, 0], [0.2, 0.25, 0.2], DARK),
      box([0, 0.3, -1], [0.045, 0.045, 1.2], SILVER),
      box([0, 0.3, -1.65], [0.17, 0.17, 0.17], DARK),
    ];
  }
}
function meshFor(part: Part): Mesh {
  const geometry = part.shape === 'box' ? new BoxGeometry(1, 1, 1)
    : part.shape === 'cylinder' ? new CylinderGeometry(1, 1, 1, part.segments)
    : new LatheGeometry(Array.from({ length: 9 }, (_, i) => {
      const r = i / 8;
      return new Vector2(r, 0.25 * r * r);
    }), 32);
  const mesh = new Mesh(geometry, new MeshStandardMaterial({
    color: part.color, roughness: 0.55, metalness: 0.35, side: DoubleSide,
  }));
  mesh.position.set(...part.position);
  mesh.scale.set(...part.scale);
  if (part.rotation) mesh.rotation.set(...part.rotation);
  return mesh;
}
export function createSpacecraftModel(kind: SpacecraftModelKind): SpacecraftModel {
  const content = new Group(), root = new Group();
  root.add(content);
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    root.traverse(object => {
      if (!(object instanceof Mesh)) return;
      object.geometry.dispose();
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose();
    });
    root.clear();
  };
  try {
    partsFor(kind).forEach(part => content.add(meshFor(part)));
    content.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(content).getBoundingSphere(new Sphere());
    if (!Number.isFinite(bounds.radius) || bounds.radius <= 0) throw new Error('模型几何边界无效');
    content.position.sub(bounds.center);
    root.scale.setScalar(1 / bounds.radius);
    return { root, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}
