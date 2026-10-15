import { describe, expect, it } from 'vitest';
import { BufferGeometry, Material, Mesh, PerspectiveCamera, Vector3 } from 'three';
import { catalog } from '../simulation/catalog';
import { createRuntime } from './runtime';
import { createSolarScene } from './solar-scene';
import { toSceneDirection } from '../simulation/coordinates';
import { sampleOrbit } from './orbit-guides';

describe('solar scene contract and resource lifetime', () => {
  it.each([
    ['real', 16 / 9], ['schematic', 16 / 9], ['real', 0.6], ['schematic', 0.6],
  ] as const)('frames every Saturn ring vertex after fly-to in %s mode at aspect %s without rescaling geometry', (mode, aspect) => {
    const runtime = createRuntime();
    runtime.dispatch({ type: 'set-date', julianDay: 2461327.323937 });
    runtime.dispatch({ type: 'set-paused', paused: true });
    runtime.dispatch({ type: 'set-mode', mode });
    runtime.dispatch({ type: 'set-viewport', verticalFovRad: Math.PI / 3, aspect });
    runtime.dispatch({ type: 'fly-to', id: 'saturn' });
    for (let i = 0; i < 200 && runtime.getSnapshot().navigation.flight; i++) runtime.tick(1 / 60);
    expect(runtime.getSnapshot().navigation.mode).toBe('orbit');
    const scene = createSolarScene(catalog, 'standard');
    const camera = new PerspectiveCamera(60, aspect);
    scene.update(runtime.getSnapshot(), camera);
    const rings = scene.pickable.find(mesh => mesh.geometry.type === 'RingGeometry')!;
    const positions = rings.geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      const projected = rings.localToWorld(new Vector3().fromBufferAttribute(positions, i)).project(camera);
      expect(Math.abs(projected.x)).toBeLessThan(0.9);
      expect(Math.abs(projected.y)).toBeLessThan(0.9);
    }
    expect((rings.geometry as import('three').RingGeometry).parameters.outerRadius).toBe(2.32);
    expect(scene.bodies.get('saturn')!.root.scale.x).toBe(runtime.getSnapshot().displayWorld.saturn.radius);
    scene.dispose(); runtime.dispose();
  });
  it('uses physical radii, a camera-relative origin, and catalog poles for all ten meshes', () => {
    const runtime = createRuntime();
    runtime.dispatch({ type: 'set-paused', paused: true });
    const scene = createSolarScene(catalog, 'standard');
    const camera = new PerspectiveCamera(60, 2, 0.01, 1e7);
    scene.update(runtime.getSnapshot(), camera);
    expect(camera.position.toArray()).toEqual([0, 0, 0]);
    expect(scene.bodies.size).toBe(10);
    const earth = scene.bodies.get('earth')!;
    expect(earth.root.position.length()).toBeCloseTo(4 * catalog.earth.radiusKm / 1000, 4);
    expect(earth.root.scale.x).toBe(catalog.earth.radiusKm / 1000);
    const north = new Vector3(0, 1, 0).applyQuaternion(earth.surface.quaternion);
    expect(north.distanceTo(new Vector3(...toSceneDirection(catalog.earth.northPole!)))).toBeLessThan(1e-10);
    expect(earth.surface.userData.bodyId).toBe('earth');
    expect(scene.background).not.toBe(scene.scene);
    scene.dispose(); runtime.dispose();
  });
  it('places schematic meshes using exactly the runtime mapping without changing physical state', () => {
    const runtime = createRuntime();
    runtime.dispatch({ type: 'set-mode', mode: 'schematic' });
    const frame = runtime.getSnapshot(), physical = frame.world.bodies.earth.positionKm;
    const scene = createSolarScene(catalog, 'low');
    const camera = new PerspectiveCamera();
    scene.update(frame, camera);
    expect(scene.bodies.get('earth')!.root.scale.x).toBe(frame.displayWorld.earth.radius);
    expect(scene.bodies.get('earth')!.root.position.length()).toBeCloseTo(frame.displayWorld.earth.radius * 4, 8);
    expect(frame.world.bodies.earth.positionKm).toBe(physical);
    scene.dispose(); runtime.dispose();
  });
  it('disposes each shared geometry and material exactly once, including background and effects', () => {
    const scene = createSolarScene(catalog, 'standard');
    const resources = new Set<BufferGeometry | Material>();
    for (const root of [scene.scene, scene.background]) root.traverse(object => {
      const mesh = object as Mesh;
      if (mesh.geometry) resources.add(mesh.geometry);
      if (mesh.material) for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) resources.add(m);
    });
    const counts = new Map<BufferGeometry | Material, number>();
    for (const r of resources) r.addEventListener('dispose', () => counts.set(r, (counts.get(r) ?? 0) + 1));
    scene.dispose(); scene.dispose();
    expect(resources.size).toBeGreaterThan(10);
    expect([...resources].map(r => counts.get(r))).toEqual([...resources].map(() => 1));
  });
  it('traces actual ephemeris samples instead of making a flat circular guide', () => {
    const samples = sampleOrbit('moon', 2461000, catalog, (_id, jd) => [
      384400 * Math.cos((jd - 2461000) / 27.3 * Math.PI * 2),
      360000 * Math.sin((jd - 2461000) / 27.3 * Math.PI * 2),
      40000 * Math.sin((jd - 2461000) / 27.3 * Math.PI * 2),
    ], 48);
    expect(samples.length).toBe(49);
    expect(samples.some(p => Math.abs(p[2]) > 30000)).toBe(true);
    expect(samples.some(p => Math.hypot(...p) < 375000)).toBe(true);
  });
});
