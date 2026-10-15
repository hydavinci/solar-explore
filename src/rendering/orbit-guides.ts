import { BufferAttribute, BufferGeometry, Group, Line, LineBasicMaterial } from 'three';
import { MIN_JD, MAX_JD } from '../simulation/clock';
import { evaluateMoonRelative, evaluatePlanet, splitEarthMoon } from '../simulation/orbits';
import { BODY_IDS, type BodyId, type Catalog, type Vec3 } from '../simulation/types';
import { toRelativeScene } from '../simulation/coordinates';
import { add, sub } from '../simulation/vector';
import { mapPosition } from './display-mapping';
import { getDisplayCamera, type FrameSnapshot } from './runtime';

type OrbitEvaluator = (id: Exclude<BodyId, 'sun'>, jd: number) => Vec3;
function evaluator(catalog: Catalog): OrbitEvaluator {
  return (id, jd) => {
    if (id === 'moon') return evaluateMoonRelative(jd);
    const position = evaluatePlanet(id, jd);
    return id === 'earth' ? splitEarthMoon(position, evaluateMoonRelative(jd), catalog.earth.massKg, catalog.moon.massKg).earth : position;
  };
}
/** Sample a dated ephemeris arc; period is estimated from the current osculating energy. */
export function sampleOrbit(id: Exclude<BodyId, 'sun'>, epoch: number, catalog: Catalog, evaluate: OrbitEvaluator = evaluator(catalog), segments = 128): Vec3[] {
  const t = Math.max(MIN_JD + 0.01, Math.min(MAX_JD - 0.02, epoch));
  const position = evaluate(id, t), before = evaluate(id, t - 0.005), after = evaluate(id, t + 0.005);
  const velocitySq = sub(after, before).reduce((sum, v) => sum + (v / 864) ** 2, 0);
  const mu = 6.67430e-20 * catalog[catalog[id].parentId!].massKg;
  const semimajor = 1 / (2 / Math.hypot(...position) - velocitySq / mu);
  const period = Math.min(MAX_JD - MIN_JD - 1, 2 * Math.PI * Math.sqrt(Math.max(1, semimajor) ** 3 / mu) / 86400);
  const start = Math.max(MIN_JD, Math.min(MAX_JD - period - 0.001, t - period / 2));
  return Array.from({ length: segments + 1 }, (_, i) => evaluate(id, start + period * i / segments));
}

export function createOrbitGuides(catalog: Catalog, onError: (message: string) => void) {
  const group = new Group();
  const material = new LineBasicMaterial({ color: 0x8eafd0, transparent: true, opacity: 0.55, depthWrite: false });
  const lines = new Map<Exclude<BodyId, 'sun'>, { line: Line; samples: Vec3[]; epoch: number }>();
  const pending = new Map<Exclude<BodyId, 'sun'>, number>();
  let timer: ReturnType<typeof setTimeout> | undefined, dead = false;
  const work = () => {
    timer = undefined;
    if (dead) return;
    const next = pending.entries().next().value;
    if (!next) return;
    const [id, epoch] = next;
    pending.delete(id);
    try {
      const samples = sampleOrbit(id, epoch, catalog);
      let entry = lines.get(id);
      if (!entry) {
        const geometry = new BufferGeometry();
        geometry.setAttribute('position', new BufferAttribute(new Float32Array(samples.length * 3), 3));
        const line = new Line(geometry, material);
        line.frustumCulled = false;
        group.add(line);
        entry = { line, samples, epoch };
        lines.set(id, entry);
      } else { entry.samples = samples; entry.epoch = epoch; }
    } catch (error) { onError(`轨道线计算失败：${error instanceof Error ? error.message : String(error)}`); }
    if (pending.size) timer = setTimeout(work, 0);
  };
  const request = (epoch: number) => {
    for (const id of BODY_IDS) if (id !== 'sun' && !pending.has(id)) {
      const entry = lines.get(id);
      if (!entry || Math.abs(entry.epoch - epoch) > (id === 'moon' ? 1 : 30)) pending.set(id, epoch);
    }
    if (pending.size && timer === undefined) timer = setTimeout(work, 0);
  };
  return {
    group, request,
    update(frame: FrameSnapshot) {
      group.visible = frame.guides.orbitsVisible;
      if (!group.visible) return;
      const origin = getDisplayCamera(frame, catalog).position;
      for (const [id, { line, samples }] of lines) {
        line.visible = !(id === 'jupiter' && frame.replayActive);
        if (!line.visible) continue;
        const parent = frame.world.bodies[catalog[id].parentId!].positionKm;
        const attribute = line.geometry.getAttribute('position');
        for (let i = 0; i < samples.length; i++) {
          const physical = add(parent, samples[i]!);
          const relative = frame.scaleMode === 'real'
            ? toRelativeScene(physical, frame.navigation.positionKm)
            : sub(mapPosition(id, physical, frame.world, catalog, frame.scaleMode), origin);
          attribute.setXYZ(i, ...relative);
        }
        attribute.needsUpdate = true;
      }
    },
    dispose() {
      if (dead) return;
      dead = true; clearTimeout(timer); pending.clear();
      for (const { line } of lines.values()) line.geometry.dispose();
      material.dispose(); group.clear(); lines.clear();
    },
  };
}
