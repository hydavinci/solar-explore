import { BODY_IDS, type Catalog, type Vec3, type WorldSnapshot } from '../simulation/types';
import { add, cross, length, normalize, rotate, scale, sub } from '../simulation/vector';
import { clipMovement, planFlight, pointAlongPath, projectOutside, segmentClearsSphere, SURFACE_FACTOR } from './flight-path';
import type { NavigationInput, NavigationState } from './types';
import { resolveTarget, type NavigationTargetId, type SpacecraftTargets } from './target';
export const EMPTY_INPUT: NavigationInput = Object.freeze({ localMove: [0, 0, 0] as const, lookDelta: [0, 0] as const, speedSteps: 0, cancel: false });
export const SPEED_LIMITS = Object.freeze({ min: 0.1, max: 1e9 });
export function orbitDistance(radius: number, fov = Math.PI / 3): number {
  return Math.max(radius * SURFACE_FACTOR, 1.2 * radius / Math.sin(fov / 2));
}
export function createNavigation(world: WorldSnapshot, catalog: Catalog, target: NavigationTargetId = 'earth', spacecraft: SpacecraftTargets = {}): NavigationState {
  const focus = resolveTarget(target, world, catalog, spacecraft), center = focus.positionKm;
  const towardSun = length(center) > 0 ? normalize(scale(center, -1)) : [1, 0, 0] as const;
  const direction = normalize(add(towardSun, [0, 0, 0.45]));
  const radius = focus.obstacleId ? catalog[focus.obstacleId].radiusKm : focus.framingRadiusKm;
  const positionKm = projectOutside(add(center, scale(direction, radius * 4)), world, catalog);
  return { mode: 'orbit', positionKm, forward: normalize(sub(center, positionKm)), up: [0, 0, 1], target,
    previousTargetPositionKm: center, speedKmPerSecond: 100, speedMultiplier: 1, flight: null, issue: null };
}
export function startFlight(state: NavigationState, id: NavigationTargetId, world: WorldSnapshot, catalog: Catalog, framingFov = Math.PI / 3, spacecraft: SpacecraftTargets = {}): NavigationState {
  const target = resolveTarget(id, world, catalog, spacecraft), center = target.positionKm;
  const towardStart = sub(state.positionKm, center);
  const offset = scale(length(towardStart) > 0 ? normalize(towardStart) : [0, 0, 1], orbitDistance(target.framingRadiusKm, framingFov));
  const route = planFlight(state.positionKm, add(center, offset), world, catalog);
  if (!route.ok) throw new Error(route.message);
  return { ...state, mode: 'flight', target: id, previousTargetPositionKm: center, issue: null,
    flight: { elapsedSeconds: 0, durationSeconds: 3, waypointsKm: route.points, destinationOffsetKm: offset } };
}
const smooth = (t: number): number => t * t * (3 - 2 * t);
export function stepNavigation(state: NavigationState, input: NavigationInput, world: WorldSnapshot, catalog: Catalog, realDeltaSeconds: number, spacecraft: SpacecraftTargets = {}): NavigationState {
  if (!Number.isFinite(realDeltaSeconds) || realDeltaSeconds < 0 || ![...input.localMove, ...input.lookDelta, input.speedSteps].every(Number.isFinite)) throw new Error('Invalid navigation input');
  let next: NavigationState = { ...state, issue: null };
  const moving = length(input.localMove) > 0 || input.lookDelta[0] !== 0 || input.lookDelta[1] !== 0;
  if (next.mode === 'flight' && (moving || input.cancel)) next = { ...next, mode: 'free', flight: null };
  const focus = next.target ? resolveTarget(next.target, world, catalog, spacecraft) : null;
  const center = focus?.positionKm ?? null;
  if (center && next.previousTargetPositionKm && (next.mode === 'orbit' || next.mode === 'follow')) {
    const desired = add(next.positionKm, sub(center, next.previousTargetPositionKm));
    // Camera and target share this translation; only other bodies can obstruct it.
    const positionKm = clipMovement(next.positionKm, desired, world, catalog, focus?.obstacleId ?? undefined);
    const blocked = length(sub(desired, positionKm)) > 1e-6;
    next = { ...next, positionKm, mode: blocked ? 'free' : next.mode,
      issue: blocked ? '目标移动路径被天体阻挡，已停止跟随以保持安全距离' : next.issue };
  }
  const safe = projectOutside(next.positionKm, world, catalog);
  if (length(sub(safe, next.positionKm)) > 0) next = { ...next, positionKm: safe, issue: '时间跳转或天体移动导致相机重叠，已调整至安全表面之外' };
  const speedSteps = next.mode === 'orbit' ? 0 : input.speedSteps;
  const speedMultiplier = Math.min(1e6, Math.max(1e-6, next.speedMultiplier * 2 ** Math.max(-40, Math.min(40, speedSteps))));
  const nearest = Math.min(...BODY_IDS.map(id => length(sub(next.positionKm, world.bodies[id].positionKm)) - catalog[id].radiusKm),
    focus?.obstacleId === null ? length(sub(next.positionKm, focus.positionKm)) : Infinity);
  const desiredSpeed = Math.min(SPEED_LIMITS.max, Math.max(SPEED_LIMITS.min, nearest * 0.5 * speedMultiplier));
  const speed = next.speedKmPerSecond + (desiredSpeed - next.speedKmPerSecond) * (1 - Math.exp(-realDeltaSeconds * 5));
  next = { ...next, speedMultiplier, speedKmPerSecond: speed, previousTargetPositionKm: center };
  if (next.mode === 'flight' && next.flight && next.target && center) {
    const flight = next.flight;
    const last = flight.waypointsKm[flight.waypointsKm.length - 1]!;
    const offset = flight.destinationOffsetKm ?? sub(last, center);
    const route = planFlight(next.positionKm, add(center, offset), world, catalog);
    if (!route.ok) return { ...next, mode: 'free', flight: null, issue: route.message };
    const elapsed = Math.min(flight.durationSeconds, flight.elapsedSeconds + realDeltaSeconds);
    const oldT = smooth(flight.elapsedSeconds / flight.durationSeconds), newT = smooth(elapsed / flight.durationSeconds);
    const fraction = oldT >= 1 ? 1 : (newT - oldT) / (1 - oldT);
    const desired = pointAlongPath(route.points, fraction);
    // Keep a safe bend if a long frame would replace verified route legs with an unsafe chord.
    const clears = BODY_IDS.every(id => segmentClearsSphere(next.positionKm, desired, world.bodies[id].positionKm, catalog[id].radiusKm * SURFACE_FACTOR));
    const positionKm = clipMovement(next.positionKm, clears ? desired : route.points[1]!, world, catalog);
    const tolerance = focus!.obstacleId ? catalog[focus!.obstacleId].radiusKm * 1e-6 : Math.max(1e-5, focus!.framingRadiusKm * 1e-6);
    const finished = elapsed >= flight.durationSeconds - 1e-9 && length(sub(positionKm, add(center, offset))) < tolerance;
    return { ...next, positionKm, forward: normalize(sub(center, positionKm)), mode: finished ? 'orbit' : 'flight',
      flight: finished ? null : { ...flight, elapsedSeconds: elapsed, waypointsKm: route.points } };
  }
  const yaw = -input.lookDelta[0] * 0.003, pitch = -input.lookDelta[1] * 0.003;
  let right = cross(next.forward, next.up);
  if (length(right) < 1e-8) right = cross(next.forward, [0, 1, 0]);
  right = normalize(right);
  if (next.mode === 'orbit' && center && next.target) {
    const initialOffset = sub(next.positionKm, center), initialDistance = length(initialOffset);
    const orbitYaw = Math.max(-Math.PI, Math.min(Math.PI, yaw - input.localMove[0] * realDeltaSeconds));
    const orbitPitch = Math.max(-Math.PI, Math.min(Math.PI, pitch + input.localMove[1] * realDeltaSeconds));
    const zoom = Math.max(-40, Math.min(40, -input.localMove[2] * realDeltaSeconds * speedMultiplier - input.speedSteps * 0.2));
    const distance = Math.max(focus!.minimumDistanceKm, initialDistance * Math.exp(zoom));
    const angle = Math.abs(orbitYaw) + Math.abs(orbitPitch);
    const steps = Math.max(1, Math.ceil(angle / 0.04));
    let positionKm = next.positionKm, up = next.up;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const yawRight = rotate(right, next.up, orbitYaw * t);
      const offset = rotate(rotate(initialOffset, next.up, orbitYaw * t), yawRight, orbitPitch * t);
      const desired = add(center, scale(normalize(offset), initialDistance + (distance - initialDistance) * t));
      // The target is excluded only because the spherical arc analytically stays above its surface.
      // Inflate other spheres to cover the deviation between each arc and its swept chord.
      const inflation = Math.max(initialDistance, distance) * (angle / steps) ** 2 / 8
        + Math.abs(distance - initialDistance) / steps * angle / steps;
      const clipped = clipMovement(positionKm, desired, world, catalog, focus?.obstacleId ?? undefined, inflation);
      if (length(sub(clipped, desired)) > 1e-6) break;
      positionKm = desired;
      up = rotate(next.up, yawRight, orbitPitch * t);
    }
    return { ...next, positionKm, up, forward: normalize(sub(center, positionKm)) };
  }
  right = normalize(rotate(right, next.up, yaw));
  const forward = yaw === 0 && pitch === 0 ? next.forward : normalize(rotate(rotate(next.forward, next.up, yaw), right, pitch));
  const up = yaw === 0 && pitch === 0 ? next.up : normalize(cross(right, forward));
  let movement = add(add(scale(right, input.localMove[0]), scale(up, input.localMove[1])), scale(forward, input.localMove[2]));
  if (length(movement) > 1) movement = normalize(movement);
  return { ...next, forward, up, positionKm: clipMovement(next.positionKm, add(next.positionKm, scale(movement, speed * realDeltaSeconds)), world, catalog) };
}
