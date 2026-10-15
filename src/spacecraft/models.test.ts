import { expect, it } from 'vitest';
import { Box3, Mesh, Sphere } from 'three';
import { createSpacecraftModel } from './models';

it.each(['voyager', 'cassini', 'juno', 'new-horizons', 'tianwen-orbiter'] as const)(
  '%s has finite, framed geometry and releases each resource once', kind => {
    const model = createSpacecraftModel(kind);
    model.root.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(model.root).getBoundingSphere(new Sphere());
    expect(bounds.center.length()).toBeLessThan(1e-6);
    expect(bounds.radius).toBeCloseTo(1, 5);
    let triangles = 0;
    const resources = new Set<{ addEventListener(type: 'dispose', listener: () => void): void }>();
    model.root.traverse(object => {
      if (!(object instanceof Mesh)) return;
      const positions = object.geometry.getAttribute('position');
      expect(Array.from(positions.array).every(Number.isFinite)).toBe(true);
      triangles += (object.geometry.index?.count ?? positions.count) / 3;
      resources.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) resources.add(material);
    });
    expect(triangles).toBeGreaterThan(100);
    expect(triangles).toBeLessThanOrEqual(20000);
    const disposals = new Map<object, number>();
    for (const resource of resources) resource.addEventListener('dispose', () =>
      disposals.set(resource, (disposals.get(resource) ?? 0) + 1));
    model.dispose(); model.dispose();
    expect([...disposals.values()]).toEqual([...resources].map(() => 1));
    expect(model.root.children).toHaveLength(0);
  },
);

it('keeps separately opened previews independently disposable', () => {
  const first = createSpacecraftModel('voyager'), second = createSpacecraftModel('voyager');
  const resources = new Set<object>();
  first.root.traverse(object => {
    if (object instanceof Mesh) { resources.add(object.geometry); resources.add(object.material); }
  });
  first.dispose();
  let meshes = 0;
  second.root.traverse(object => {
    if (!(object instanceof Mesh)) return;
    meshes++;
    expect(resources.has(object.geometry)).toBe(false);
    expect(resources.has(object.material)).toBe(false);
  });
  expect(meshes).toBeGreaterThan(5);
  second.dispose();
});
