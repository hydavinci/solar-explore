import { catalog as defaultCatalog } from '../simulation/catalog';
import { advanceClock, assertValidDate, nowJulianDay, type ClockState } from '../simulation/clock';
import { evaluateWorld } from '../simulation/world';
import { isBodyId, type Catalog, type BodyId, type ScaleMode, type WorldEvaluator, type WorldSnapshot } from '../simulation/types';
import { add, length, normalize, scale, sub } from '../simulation/vector';
import { createNavigation, EMPTY_INPUT, startFlight, stepNavigation } from '../navigation/controller';
import type { NavigationInput, NavigationState } from '../navigation/types';
import { displayRadius, mapCamera, mapPosition, mapWorld, navigationGeometry, unmapCamera, type DisplayWorld } from './display-mapping';
import { fromSceneDirection, toSceneDirection } from '../simulation/coordinates';
import { isSpacecraftId, type SpacecraftId } from '../spacecraft/catalog';
import { resolveTarget, type NavigationTargetId, type SpacecraftTargets } from '../navigation/target';
import { loadTrajectory, sampleTrajectory, trajectoryManifest, utcMilliseconds, type TrajectoryData, type TrajectoryResource, type TrajectorySample } from '../spacecraft/trajectory';

export type Selection =
  | { readonly kind: 'body'; readonly id: BodyId }
  | { readonly kind: 'spacecraft'; readonly id: SpacecraftId };
export function getSelectedBodyId(selection: Selection | null): BodyId | null {
  return selection?.kind === 'body' ? selection.id : null;
}
export interface FrameSnapshot {
  readonly world: WorldSnapshot;
  readonly displayWorld: DisplayWorld;
  readonly navigation: NavigationState;
  readonly selection: Selection | null;
  readonly clock: ClockState;
  readonly scaleMode: ScaleMode;
  readonly guides: { readonly labelsVisible: boolean; readonly orbitsVisible: boolean; readonly hudVisible: boolean };
  readonly issue: { readonly code: string; readonly message: string } | null;
  readonly trajectory: TrajectoryResource;
  readonly replayActive: boolean;
  readonly spacecraftState: TrajectorySample | null;
}
export type RuntimeCommand =
  | { type: 'select'; id: BodyId }
  | { type: 'select-spacecraft'; id: SpacecraftId }
  | { type: 'activate-spacecraft'; id: SpacecraftId }
  | { type: 'fly-to-spacecraft'; id: SpacecraftId }
  | { type: 'load-trajectory' }
  | { type: 'enter-replay' }
  | { type: 'exit-replay' }
  | { type: 'clear-issue' }
  | { type: 'fly-to'; id: BodyId }
  | { type: 'set-mode'; mode: ScaleMode }
  | { type: 'overview' }
  | { type: 'set-rate'; rate: number }
  | { type: 'set-paused'; paused: boolean }
  | { type: 'set-date'; julianDay: number }
  | { type: 'set-hidden'; hidden: boolean }
  | { type: 'set-viewport'; verticalFovRad: number; aspect: number }
  | { type: 'set-guide'; key: keyof FrameSnapshot['guides']; visible: boolean }
  | { type: 'set-navigation'; mode: 'free' | 'orbit' | 'follow' };
export interface Runtime {
  tick(realDeltaSeconds: number): FrameSnapshot;
  dispatch(command: RuntimeCommand): void;
  getSnapshot(): FrameSnapshot;
  subscribe(listener: () => void): () => void;
  getCatalog(): Catalog;
  /** Queue input before tick; delta is validated for compatibility, tick owns the frame duration. */
  handleInput(input: NavigationInput, realDeltaSeconds: number): void;
  cancelTrajectoryLoad(): void;
  dispose(): void;
}
export function navigationAnchor(frame: FrameSnapshot, target = frame.navigation.target): BodyId | null {
  return isBodyId(target) ? target : target === 'voyager-1' && frame.spacecraftState ? 'jupiter' : null;
}
export function spacecraftTargets(frame: FrameSnapshot, catalog: Catalog): SpacecraftTargets {
  const state = frame.spacecraftState;
  return state ? { 'voyager-1': {
    id: 'voyager-1', positionKm: state.spacecraft.positionKm,
    framingRadiusKm: length(sub(state.spacecraft.positionKm, state.jupiter.positionKm)) + catalog.jupiter.radiusKm,
    minimumDistanceKm: 1, obstacleId: null,
  } } : {};
}
export function spacecraftAvailability(frame: FrameSnapshot, id: SpacecraftId): 'missing' | 'loading' | 'error' | 'out-of-range' | 'available' {
  if (id !== 'voyager-1') return 'missing';
  if (frame.trajectory.kind === 'idle' || frame.trajectory.kind === 'loading') return 'loading';
  if (frame.trajectory.kind === 'error') return 'error';
  return sampleTrajectory(frame.trajectory.data, utcMilliseconds(frame.clock.julianDay)) ? 'available' : 'out-of-range';
}
export function getDisplayCamera(snapshot: FrameSnapshot, catalog: Catalog) {
  const { navigation: nav, world, scaleMode } = snapshot;
  const anchor = navigationAnchor(snapshot);
  const position = mapCamera(nav.positionKm, anchor, world, catalog, scaleMode);
  const schematicOverview = scaleMode === 'schematic' && anchor === null;
  return {
    position,
    forward: schematicOverview ? normalize(scale(position, -1)) : toSceneDirection(nav.forward),
    up: toSceneDirection(nav.up),
  };
}
function overview(state: NavigationState): NavigationState {
  const positionKm = [0, -7e9, 5e9] as const;
  return { ...state, mode: 'free', target: null, previousTargetPositionKm: null, flight: null,
    positionKm, forward: normalize(scale(positionKm, -1)), up: [0, 0, 1], issue: null };
}
function reanchor(frame: FrameSnapshot, target: NavigationTargetId, catalog: Catalog): NavigationState {
  const navigation = frame.navigation;
  const focus = resolveTarget(target, frame.world, catalog, spacecraftTargets(frame, catalog));
  const anchor = focus.obstacleId ?? 'jupiter';
  const positionKm = frame.scaleMode === 'schematic' && navigation.target !== target
    ? unmapCamera(getDisplayCamera(frame, catalog).position, anchor, frame.world, catalog, frame.scaleMode)
    : navigation.positionKm;
  return { ...navigation, positionKm, target, previousTargetPositionKm: focus.positionKm };
}
function advanceNavigation(frame: FrameSnapshot, world: WorldSnapshot, input: NavigationInput, catalog: Catalog, delta: number, state = frame.spacecraftState): NavigationState {
  let navigation = frame.navigation;
  const target = navigation.target;
  const current = { ...frame, world, spacecraftState: state };
  const anchor = navigationAnchor(current);
  if (frame.scaleMode === 'schematic' && target && anchor && world !== frame.world) {
    const oldCamera = getDisplayCamera(frame, catalog).position;
    const oldFocus = resolveTarget(target, frame.world, catalog, spacecraftTargets(frame, catalog));
    const focus = resolveTarget(target, world, catalog, spacecraftTargets(current, catalog));
    const displayCenter = (position: typeof focus.positionKm, w: WorldSnapshot) => isBodyId(target)
      ? mapPosition(target, position, w, catalog, 'schematic') : mapCamera(position, anchor, w, catalog, 'schematic');
    const centerShift = sub(displayCenter(focus.positionKm, world), displayCenter(oldFocus.positionKm, frame.world));
    const physicalShift = scale(fromSceneDirection(centerShift), catalog[anchor].radiusKm / displayRadius(anchor, catalog, 'schematic'));
    navigation = { ...navigation, positionKm: unmapCamera(oldCamera, anchor, world, catalog, 'schematic'),
      previousTargetPositionKm: sub(focus.positionKm, physicalShift) };
  }
  const geometry = navigationGeometry(world, catalog, frame.scaleMode, anchor);
  return stepNavigation(navigation, input, geometry.world, geometry.catalog, delta, spacecraftTargets(current, catalog));
}
function clearSpacecraftNavigation(navigation: NavigationState): NavigationState {
  return navigation.target && !isBodyId(navigation.target)
    ? { ...navigation, mode: 'free', target: null, previousTargetPositionKm: null, flight: null } : navigation;
}
export function createRuntime(catalog: Catalog = defaultCatalog, evaluate: WorldEvaluator = evaluateWorld,
  trajectoryLoader: (signal: AbortSignal) => Promise<TrajectoryData> = loadTrajectory): Runtime {
  const clock: ClockState = { julianDay: nowJulianDay(), rate: 1, paused: false, hidden: false };
  const world = evaluate(clock.julianDay);
  let frame: FrameSnapshot = {
    clock, world, displayWorld: mapWorld(world, catalog, 'real'), navigation: createNavigation(world, catalog),
    selection: { kind: 'body', id: 'earth' }, scaleMode: 'real', guides: { labelsVisible: true, orbitsVisible: true, hudVisible: true }, issue: null,
    trajectory: { kind: 'idle' }, replayActive: false, spacecraftState: null,
  };
  let elapsedNotification = 0, disposed = false, skipNextDelta = false;
  let framingFov = Math.PI / 3;
  let pendingInput: NavigationInput = EMPTY_INPUT;
  const listeners = new Set<() => void>();
  const publish = () => { if (!disposed) listeners.forEach(listener => listener()); };
  const fail = (error: unknown, code = 'invalid-command') => {
    frame = { ...frame, issue: { code, message: error instanceof Error ? error.message : String(error) } };
  };
  const withNavigationIssue = (next: FrameSnapshot): FrameSnapshot => next.navigation.issue
    ? { ...next, issue: { code: 'navigation', message: next.navigation.issue } } : next;
  let loadController: AbortController | null = null, loadGeneration = 0;
  const cancelTrajectoryLoad = () => {
    loadGeneration++; loadController?.abort(); loadController = null;
    if (frame.trajectory.kind === 'loading') { frame = { ...frame, trajectory: { kind: 'idle' } }; publish(); }
  };
  const beginLoad = () => {
    if (frame.trajectory.kind === 'ready' || frame.trajectory.kind === 'loading') return;
    const controller = new AbortController(), generation = ++loadGeneration;
    loadController = controller;
    frame = { ...frame, trajectory: { kind: 'loading' } }; publish();
    const failed = (error: unknown) => {
      if (disposed || generation !== loadGeneration || controller.signal.aborted) return;
      loadController = null;
      frame = { ...frame, trajectory: { kind: 'error', message: error instanceof Error ? error.message : String(error) } };
      publish();
    };
    try {
      void trajectoryLoader(controller.signal).then(data => {
        if (disposed || generation !== loadGeneration || controller.signal.aborted) return;
        loadController = null; frame = { ...frame, trajectory: { kind: 'ready', data } }; publish();
      }, failed);
    } catch (error) { failed(error); }
  };
  const evaluateReplay = (julianDay: number, active: boolean, resource: TrajectoryResource) => {
    const base = evaluate(julianDay);
    const state = active && resource.kind === 'ready' ? sampleTrajectory(resource.data, utcMilliseconds(julianDay)) : null;
    const world = state ? { ...base, bodies: { ...base.bodies, jupiter: { ...base.bodies.jupiter, positionKm: state.jupiter.positionKm } } } : base;
    return { base, world, state };
  };
  const changeWorld = (before: FrameSnapshot, julianDay: number, active: boolean, dateJump: boolean): FrameSnapshot => {
    const { world, state } = evaluateReplay(julianDay, active, before.trajectory);
    let next: FrameSnapshot = {
      ...before, world, spacecraftState: state, replayActive: state !== null,
      clock: julianDay === before.clock.julianDay ? before.clock : { ...before.clock, julianDay },
      displayWorld: mapWorld(world, catalog, before.scaleMode),
      navigation: state ? before.navigation : clearSpacecraftNavigation(before.navigation),
    };
    if (dateJump) {
      let navigation = { ...next.navigation, flight: null, mode: next.navigation.mode === 'flight' ? 'orbit' as const : next.navigation.mode };
      if (navigation.target) {
        const oldCenter = resolveTarget(navigation.target, before.world, catalog, spacecraftTargets(before, catalog)).positionKm;
        const center = resolveTarget(navigation.target, world, catalog, spacecraftTargets(next, catalog)).positionKm;
        navigation = { ...navigation, positionKm: add(navigation.positionKm, sub(center, oldCenter)), previousTargetPositionKm: center };
      }
      next = { ...next, navigation };
      next = { ...next, navigation: advanceNavigation(next, world, EMPTY_INPUT, catalog, 0) };
    } else {
      const previous = { ...before, navigation: next.navigation };
      next = { ...next, navigation: advanceNavigation(previous, world, EMPTY_INPUT, catalog, 0, state) };
    }
    return next;
  };
  const fly = (next: FrameSnapshot, target: NavigationTargetId): FrameSnapshot => {
    const navigation = reanchor(next, target, catalog);
    const geometry = navigationGeometry(next.world, catalog, next.scaleMode, navigationAnchor(next, target));
    return { ...next, navigation: startFlight(navigation, target, geometry.world, geometry.catalog, framingFov, spacecraftTargets(next, catalog)) };
  };
  const requireSpacecraft = (next: FrameSnapshot, id: SpacecraftId) => {
    if (!isSpacecraftId(id)) throw new Error('未知航天器');
    if (id !== 'voyager-1') throw new Error('该航天器暂无可用轨迹，无法飞近、环绕或跟随');
    if (spacecraftAvailability(next, id) === 'out-of-range') throw new Error('当前日期超出历史轨迹范围，请主动选择回放日期');
    if (!next.replayActive || !next.spacecraftState) throw new Error('请先加载并启用历史回放，再飞近、环绕或跟随');
  };
  return {
    getSnapshot: () => frame,
    getCatalog: () => catalog,
    cancelTrajectoryLoad,
    subscribe(listener) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    handleInput(input, delta) {
      if (disposed || frame.clock.hidden || skipNextDelta) return;
      try {
        if (!Number.isFinite(delta) || delta < 0 || ![...input.localMove, ...input.lookDelta, input.speedSteps].every(Number.isFinite)) throw new Error('Invalid navigation input');
        pendingInput = { localMove: [...input.localMove], lookDelta: [...input.lookDelta], speedSteps: input.speedSteps, cancel: input.cancel };
      } catch (error) { fail(error, 'navigation'); publish(); }
    },
    tick(realDeltaSeconds) {
      if (disposed) return frame;
      try {
        if (!Number.isFinite(realDeltaSeconds) || realDeltaSeconds < 0) throw new Error('Frame delta must be finite and non-negative');
        const delta = skipNextDelta ? 0 : realDeltaSeconds;
        const input = skipNextDelta || frame.clock.hidden || (frame.scaleMode === 'schematic' && frame.navigation.mode === 'free') ? EMPTY_INPUT : pendingInput;
        pendingInput = EMPTY_INPUT;
        skipNextDelta = false;
        const advanced = advanceClock(frame.clock, delta);
        let clock = advanced.state, world = frame.world, state = frame.spacecraftState, previous = frame;
        let crossedBoundary = false;
        if (clock.julianDay !== frame.world.julianDay) {
          const evaluated = evaluateReplay(clock.julianDay, frame.replayActive, frame.trajectory);
          state = evaluated.state; world = evaluated.world;
          crossedBoundary = frame.replayActive && (!state || state.segmentIndex !== frame.spacecraftState?.segmentIndex);
          if (crossedBoundary) {
            state = null; world = evaluated.base; clock = { ...clock, paused: true };
            previous = { ...frame, navigation: clearSpacecraftNavigation(frame.navigation) };
          }
        }
        const navigation = clock.hidden ? previous.navigation : advanceNavigation(previous, world, input, catalog, delta, state);
        frame = withNavigationIssue({
          ...frame, clock, world, navigation, spacecraftState: state, replayActive: state !== null,
          displayWorld: world === frame.world ? frame.displayWorld : mapWorld(world, catalog, frame.scaleMode),
          issue: advanced.boundaryReached ? { code: 'date-boundary', message: '已到达 UTC 日期范围边界，模拟已暂停' }
            : crossedBoundary ? { code: 'trajectory-boundary', message: '已跨越轨迹数据段边界或覆盖范围，回放已退出并暂停' } : frame.issue,
        });
        elapsedNotification += delta;
        if (elapsedNotification >= 0.1 - 1e-10) {
          elapsedNotification = Math.max(0, elapsedNotification - Math.floor((elapsedNotification + 1e-10) / 0.1) * 0.1);
          publish();
        }
      } catch (error) {
        pendingInput = EMPTY_INPUT;
        frame = { ...frame, clock: { ...frame.clock, paused: true } };
        fail(error, 'simulation'); publish();
      }
      return frame;
    },
    dispatch(command) {
      if (disposed) return;
      try {
        if (command.type === 'load-trajectory') { beginLoad(); return; }
        const selectionOnly = command.type === 'select' || command.type === 'select-spacecraft'
          || (command.type === 'activate-spacecraft' && spacecraftAvailability(frame, command.id) !== 'available');
        let next: FrameSnapshot = selectionOnly ? frame : { ...frame, issue: null };
        switch (command.type) {
          case 'set-viewport':
            if (!Number.isFinite(command.verticalFovRad) || command.verticalFovRad <= 0 || command.verticalFovRad >= Math.PI
                || !Number.isFinite(command.aspect) || command.aspect <= 0) throw new Error('无效相机视场');
            framingFov = Math.min(command.verticalFovRad, 2 * Math.atan(Math.tan(command.verticalFovRad / 2) * command.aspect));
            return;
          case 'select':
            if (!isBodyId(command.id)) throw new Error('未知天体');
            next = { ...next, selection: { kind: 'body', id: command.id } };
            break;
          case 'select-spacecraft':
            if (!isSpacecraftId(command.id)) throw new Error('未知航天器');
            next = { ...next, selection: { kind: 'spacecraft', id: command.id } };
            break;
          case 'activate-spacecraft':
            if (!isSpacecraftId(command.id)) throw new Error('未知航天器');
            next = { ...next, selection: { kind: 'spacecraft', id: command.id } };
            if (spacecraftAvailability(next, command.id) === 'available') {
              next = changeWorld(next, next.clock.julianDay, true, false);
              next = fly(next, command.id);
            }
            break;
          case 'enter-replay':
            if (next.trajectory.kind !== 'ready') throw new Error('历史轨迹资源尚未加载成功，请稍后重试');
            next = changeWorld({ ...next, selection: { kind: 'spacecraft', id: 'voyager-1' },
              clock: { ...next.clock, paused: true, rate: 3600 } }, Date.parse(trajectoryManifest.presetUtc) / 86400000 + 2440587.5, true, true);
            requireSpacecraft(next, 'voyager-1');
            next = fly(next, 'voyager-1');
            break;
          case 'exit-replay':
            next = changeWorld(next, next.clock.julianDay, false, false);
            break;
          case 'clear-issue':
            next = { ...next, navigation: next.navigation.issue ? { ...next.navigation, issue: null } : next.navigation };
            break;
          case 'fly-to-spacecraft':
            requireSpacecraft(next, command.id);
            next = fly({ ...next, selection: { kind: 'spacecraft', id: command.id } }, command.id);
            break;
          case 'fly-to': {
            if (!isBodyId(command.id)) throw new Error('未知天体');
            next = fly({ ...next, selection: { kind: 'body', id: command.id } }, command.id);
            break;
          }
          case 'set-mode': {
            if (command.mode !== 'real' && command.mode !== 'schematic') throw new Error('未知尺度模式');
            const target = getSelectedBodyId(next.selection)
              ?? (next.selection?.kind === 'spacecraft' ? next.selection.id === 'voyager-1' && next.spacecraftState ? 'voyager-1' : next.navigation.target : null);
            next = { ...next, scaleMode: command.mode,
              navigation: target ? { ...createNavigation(next.world, catalog, target, spacecraftTargets(next, catalog)), speedMultiplier: next.navigation.speedMultiplier } : overview(next.navigation),
              displayWorld: mapWorld(next.world, catalog, command.mode) };
            next = { ...next, navigation: advanceNavigation(next, next.world, EMPTY_INPUT, catalog, 0) };
            break;
          }
          case 'overview': next = { ...next, navigation: overview(next.navigation) }; break;
          case 'set-rate':
            if (!Number.isFinite(command.rate)) throw new Error('时间倍率必须为有限数值');
            next = { ...next, clock: { ...next.clock, rate: command.rate } }; break;
          case 'set-paused':
            if (typeof command.paused !== 'boolean') throw new Error('无效暂停状态');
            next = { ...next, clock: { ...next.clock, paused: command.paused } }; break;
          case 'set-hidden':
            if (typeof command.hidden !== 'boolean') throw new Error('无效可见状态');
            if (next.clock.hidden && !command.hidden) skipNextDelta = true;
            next = { ...next, clock: { ...next.clock, hidden: command.hidden } }; pendingInput = EMPTY_INPUT; break;
          case 'set-date': {
            assertValidDate(command.julianDay);
            const wasActive = next.replayActive;
            next = changeWorld(next, command.julianDay, wasActive, true);
            if (wasActive && !next.replayActive) next = { ...next,
              issue: { code: 'trajectory-boundary', message: '当前日期不在有效轨迹数据段内，已退出历史回放' } };
            break;
          }
          case 'set-guide':
            if (!['labelsVisible', 'orbitsVisible', 'hudVisible'].includes(command.key) || typeof command.visible !== 'boolean') throw new Error('无效辅助显示设置');
            next = { ...next, guides: { ...next.guides, [command.key]: command.visible } }; break;
          case 'set-navigation': {
            if (!['free', 'orbit', 'follow'].includes(command.mode)) throw new Error('未知导航模式');
            const target = getSelectedBodyId(next.selection) ?? (next.selection?.kind === 'spacecraft' ? next.selection.id : null);
            if (command.mode !== 'free' && target && !isBodyId(target)) requireSpacecraft(next, target);
            if (command.mode !== 'free' && !target) throw new Error(next.selection?.kind === 'spacecraft'
              ? '该航天器暂无可用轨迹，无法环绕或跟随' : '请先选择天体');
            const navigation = command.mode === 'free' || !target ? next.navigation : reanchor(next, target, catalog);
            next = { ...next, navigation: { ...navigation, mode: command.mode, flight: null } };
            next = { ...next, navigation: advanceNavigation(next, next.world, EMPTY_INPUT, catalog, 0) };
            break;
          }
          default: throw new Error('未知运行命令');
        }
        frame = selectionOnly ? next : withNavigationIssue(next);
      } catch (error) { fail(error, command.type === 'fly-to' || command.type === 'fly-to-spacecraft' ? 'flight-path' : 'invalid-command'); }
      publish();
    },
    dispose() { disposed = true; cancelTrajectoryLoad(); listeners.clear(); },
  };
}
