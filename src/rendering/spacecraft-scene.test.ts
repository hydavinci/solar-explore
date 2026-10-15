import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { Line, PerspectiveCamera } from 'three';
import { createSpacecraftScene } from './spacecraft-scene';
import { createRuntime } from './runtime';
import { createSolarScene } from './solar-scene';
import { catalog } from '../simulation/catalog';
import { evaluateWorld } from '../simulation/world';
import { decodeTrajectory } from '../spacecraft/trajectory';

const data = decodeTrajectory(JSON.parse(readFileSync(new URL('../../public/trajectories/voyager-1-jupiter-1979.json', import.meta.url), 'utf8')));
async function replay() {
  const runtime = createRuntime(catalog, evaluateWorld, async () => data);
  runtime.dispatch({ type: 'load-trajectory' });
  await vi.waitFor(() => expect(runtime.getSnapshot().trajectory.kind).toBe('ready'));
  runtime.dispatch({ type: 'enter-replay' });
  runtime.tick(3);
  return runtime;
}

it.each(['real', 'schematic'] as const)('renders separate sampled curves and places the %s current point on its curve', async mode => {
  const runtime = await replay();
  runtime.dispatch({ type: 'set-mode', mode });
  const frame = runtime.getSnapshot(), scene = createSpacecraftScene(catalog), solar = createSolarScene(catalog, 'low');
  const camera = new PerspectiveCamera(60, 1.6);
  solar.update(frame, camera); scene.update(frame, camera);
  expect(scene.group.visible).toBe(true);
  const lines = scene.group.children.filter((child): child is Line => child instanceof Line);
  expect(lines).toHaveLength(data.segments.length);
  expect(scene.vertexCount).toBeGreaterThan(396);
  const line = lines[frame.spacecraftState!.segmentIndex]!;
  const attribute = line.geometry.getAttribute('position');
  let closest = Infinity;
  for (let i = 0; i < line.geometry.drawRange.count; i++) {
    closest = Math.min(closest, Math.hypot(attribute.getX(i)-scene.position.x, attribute.getY(i)-scene.position.y, attribute.getZ(i)-scene.position.z));
  }
  expect(closest).toBeLessThan(mode === 'real' ? 0.001 : 0.000001);
  const buffers = lines.map(l => l.geometry);
  scene.update(frame, camera);
  expect(scene.group.children.filter((c): c is Line => c instanceof Line).map(l => l.geometry)).toEqual(buffers);
  runtime.dispatch({ type: 'set-guide', key: 'orbitsVisible', visible: false });
  scene.update(runtime.getSnapshot(), camera);
  expect(scene.vertexCount).toBe(0);
  expect(scene.group.visible).toBe(true);
  scene.dispose(); scene.dispose(); solar.dispose(); runtime.dispose();
});

it('releases replay geometry on exit and starts a fresh owned set on re-entry', async () => {
  const runtime = await replay(), scene = createSpacecraftScene(catalog), camera = new PerspectiveCamera();
  scene.update(runtime.getSnapshot(), camera);
  const line = scene.group.children.find((c): c is Line => c instanceof Line)!;
  let disposed = 0;
  line.geometry.addEventListener('dispose', () => disposed++);
  runtime.dispatch({ type: 'exit-replay' });
  scene.update(runtime.getSnapshot(), camera);
  expect(disposed).toBe(1);
  expect(scene.group.children).toHaveLength(0);
  expect(scene.group.visible).toBe(false);
  runtime.dispatch({ type: 'enter-replay' });
  scene.update(runtime.getSnapshot(), camera);
  expect(scene.group.children.length).toBeGreaterThan(0);
  expect(scene.group.children).not.toContain(line);
  scene.dispose(); runtime.dispose();
});
