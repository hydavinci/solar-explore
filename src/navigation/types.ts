import type { Vec3 } from '../simulation/types';
import type { NavigationTargetId } from './target';
export interface FlightState {
  readonly elapsedSeconds: number;
  readonly durationSeconds: number;
  readonly waypointsKm: readonly Vec3[];
  readonly destinationOffsetKm?: Vec3;
}
export interface NavigationState {
  readonly mode: 'free' | 'orbit' | 'follow' | 'flight';
  readonly positionKm: Vec3;
  readonly forward: Vec3;
  readonly up: Vec3;
  readonly target: NavigationTargetId | null;
  readonly previousTargetPositionKm: Vec3 | null;
  readonly speedKmPerSecond: number;
  readonly speedMultiplier: number;
  readonly flight: FlightState | null;
  readonly issue?: string | null;
}
export interface NavigationInput {
  readonly localMove: Vec3;
  readonly lookDelta: readonly [number, number];
  readonly speedSteps: number;
  readonly cancel: boolean;
}
