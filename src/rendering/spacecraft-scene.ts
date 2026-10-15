import { BufferAttribute, BufferGeometry, Group, Line, LineBasicMaterial, PerspectiveCamera, Points, PointsMaterial, Vector3 } from 'three';
import type { Catalog, Vec3 } from '../simulation/types';
import { length, lerp, sub } from '../simulation/vector';
import { toRelativeScene } from '../simulation/coordinates';
import { sampleTrajectory, type TrajectoryData } from '../spacecraft/trajectory';
import { mapCamera } from './display-mapping';
import { getDisplayCamera, type FrameSnapshot } from './runtime';

interface PathPoint { readonly utcMs: number; readonly positionKm: Vec3 }
function curves(data: TrajectoryData): PathPoint[][] {
  const at = (utcMs: number): PathPoint => {
    const sample = sampleTrajectory(data, utcMs);
    if (!sample) throw new Error('航迹细分点超出有效数据段');
    return { utcMs, positionKm: sample.spacecraft.positionKm };
  };
  return data.segments.map(segment => {
    const points: PathPoint[] = [at(segment.startUtcMs)];
    const append = (a: PathPoint, b: PathPoint, depth: number) => {
      const probes = [0.25, 0.5, 0.75].map(f => at(a.utcMs + (b.utcMs - a.utcMs)*f));
      const error = Math.max(...probes.map((p, i) => length(sub(p.positionKm, lerp(a.positionKm, b.positionKm, (i + 1)/4)))));
      if (error <= 0.05) { points.push(b); return; }
      if (depth >= 20 || points.length > 100_000) throw new Error('无法在精度限制内细分航迹');
      append(a, probes[1]!, depth + 1); append(probes[1]!, b, depth + 1);
    };
    for (let i = 1; i < segment.samples.length; i++) append(points.at(-1)!, at(segment.samples[i]![0]), 0);
    return points;
  });
}

export function createSpacecraftScene(catalog: Catalog) {
  const group = new Group(), position = new Vector3();
  group.visible = false;
  let content: {
    data: TrajectoryData;
    lines: { line: Line<BufferGeometry, LineBasicMaterial>; points: PathPoint[] }[];
    marker: Points<BufferGeometry, PointsMaterial>;
    lineMaterial: LineBasicMaterial;
  } | null = null;
  let disposed = false;
  const release = () => {
    if (!content) return;
    for (const { line } of content.lines) line.geometry.dispose();
    content.lineMaterial.dispose(); content.marker.geometry.dispose(); content.marker.material.dispose();
    group.clear(); content = null;
  };
  return {
    group, position,
    get vertexCount() { return content?.lines.reduce((n, { line }) => n + (line.visible ? line.geometry.drawRange.count : 0), 0) ?? 0; },
    update(frame: FrameSnapshot, camera: PerspectiveCamera) {
      if (disposed) return;
      if (!frame.replayActive || !frame.spacecraftState) { group.visible = false; release(); return; }
      if (frame.trajectory.kind !== 'ready') throw new Error('历史回放缺少已验证的轨迹资源');
      const data = frame.trajectory.data;
      if (content?.data !== data) {
        release();
        const paths = curves(data);
        const lineMaterial = new LineBasicMaterial({ color: 0xffbb70, transparent: true, opacity: 0.92, depthWrite: false, toneMapped: false });
        const lines = paths.map(points => {
          const geometry = new BufferGeometry();
          geometry.setAttribute('position', new BufferAttribute(new Float32Array((points.length + 1)*3), 3));
          geometry.setDrawRange(0, points.length);
          const line = new Line(geometry, lineMaterial);
          line.frustumCulled = false; group.add(line);
          return { line, points };
        });
        const geometry = new BufferGeometry();
        geometry.setAttribute('position', new BufferAttribute(new Float32Array(3), 3));
        const marker = new Points(geometry, new PointsMaterial({ color: 0xffdfad, size: 8, sizeAttenuation: false, depthWrite: false, toneMapped: false }));
        marker.frustumCulled = false; group.add(marker);
        content = { data, lines, marker, lineMaterial };
      }
      group.visible = true;
      const current = frame.spacecraftState, origin = getDisplayCamera(frame, catalog).position;
      const relative = (point: Vec3): Vec3 => frame.scaleMode === 'real'
        ? toRelativeScene(point, frame.navigation.positionKm)
        : sub(mapCamera(point, 'jupiter', frame.world, catalog, 'schematic'), origin);
      content.lineMaterial.opacity = frame.selection?.kind === 'spacecraft' && frame.selection.id === 'voyager-1' ? 0.92 : 0.58;
      position.set(...relative(current.spacecraft.positionKm));
      const markerAttribute = content.marker.geometry.getAttribute('position');
      markerAttribute.setXYZ(0, position.x, position.y, position.z); markerAttribute.needsUpdate = true;
      let far = position.length();
      for (const [index, { line, points }] of content.lines.entries()) {
        line.visible = frame.guides.orbitsVisible;
        if (!line.visible) continue;
        const attribute = line.geometry.getAttribute('position');
        let count = 0, inserted = index !== current.segmentIndex;
        const write = (point: Vec3) => {
          const p = relative(point);
          attribute.setXYZ(count++, ...p); far = Math.max(far, length(p));
        };
        for (const point of points) {
          // Keep the exact current position on the rendered curve even at extreme close-up.
          if (!inserted && current.utcMs <= point.utcMs) { write(current.spacecraft.positionKm); inserted = true; }
          write(point.positionKm);
        }
        line.geometry.setDrawRange(0, count); attribute.needsUpdate = true;
      }
      camera.far = Math.max(camera.far, far*1.05);
      camera.near = Math.min(camera.near, Math.max(0.00001, position.length()*0.05));
      camera.updateProjectionMatrix();
    },
    dispose() { if (disposed) return; disposed = true; release(); group.visible = false; },
  };
}
