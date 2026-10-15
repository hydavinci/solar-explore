import { Component, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ACESFilmicToneMapping, PerspectiveCamera, Raycaster, Texture, Vector2, Vector3 } from 'three';
import { getSelectedBodyId, type FrameSnapshot, type Runtime } from './runtime';
import type { Quality } from './quality';
import { createInputController, DRAG_THRESHOLD_PX } from '../navigation/input';
import { BODY_IDS, type BodyId } from '../simulation/types';
import { TextureCache } from '../assets/texture-cache';
import { loadTexture, SceneTextures } from '../assets/scene-textures';
import { attachGraphicsRecovery, type GraphicsState } from '../platform/graphics-recovery';
import { createSolarScene } from './solar-scene';
import { createOrbitGuides } from './orbit-guides';
import { createSpacecraftScene } from './spacecraft-scene';
import { cappedPixelRatio, isOccluded, labelProjection } from './scene-math';
import { advanceFrame } from './frame-driver';
import './renderer.css';

export interface RenderStats { fps: number; textures: number; geometries: number; estimatedBytes: number }
export interface SolarCanvasProps {
  runtime: Runtime;
  quality: Quality;
  onError: (message: string | null) => void;
  onStatus: (message: string) => void;
  onStats: (stats: RenderStats) => void;
  inputEnabled: boolean;
}
export interface SolarDiagnostics {
  /** Circular chronological samples; nextIndex is the next write position. No React updates. */
  frameTimesMs: Float32Array;
  sampleCount: number;
  nextIndex: number;
  renderCalls: number;
  triangles: number;
  points: number;
  drawingBuffer: { width: number; height: number };
  cacheBytes: number;
  selected: BodyId | null;
  context: GraphicsState;
  frameCallbacks: number;
  updateCount: number;
  rawDeltaSeconds: number;
  appliedDeltaSeconds: number;
  navigation: FrameSnapshot['navigation'];
  clock: FrameSnapshot['clock'];
  issue: FrameSnapshot['issue'];
  replayActive: boolean;
  trajectoryStatus: FrameSnapshot['trajectory']['kind'];
  spacecraftState: FrameSnapshot['spacecraftState'];
  jupiterPositionKm: FrameSnapshot['world']['bodies']['jupiter']['positionKm'];
  trajectoryVertices: number;
  spacecraftScreen: { x: number; y: number; visible: boolean } | null;
}
type DiagnosticCanvas = HTMLCanvasElement & { __solarDiagnostics?: SolarDiagnostics };

class SceneBoundary extends Component<{ onError: SolarCanvasProps['onError']; children: ReactNode }, { message: string | null }> {
  state: { message: string | null } = { message: null };
  static getDerivedStateFromError(error: Error) { return { message: error.message }; }
  componentDidCatch(error: Error) { this.props.onError(`WebGL 场景初始化失败：${error.message}`); }
  render() {
    if (this.state.message) return <section className="renderer-failure" role="alert">
      <h2>无法启动 WebGL 图形场景</h2><p>{this.state.message}</p>
      <p>请使用支持 WebGL 2 的 Chrome，并启用硬件加速。</p>
      <button onClick={() => window.location.reload()}>重新加载</button>
    </section>;
    return this.props.children;
  }
}

function SceneDriver({ propsRef, labelsRef, setGraphics, setTextureError, retryRef }: {
  propsRef: RefObject<SolarCanvasProps>;
  labelsRef: RefObject<HTMLDivElement | null>;
  setGraphics: (state: GraphicsState) => void;
  setTextureError: (message: string) => void;
  retryRef: RefObject<(() => void) | null>;
}) {
  const { gl, camera, size } = useThree();
  const { runtime } = propsRef.current;
  const sizeRef = useRef(size); sizeRef.current = size;
  const loop = useRef<((delta: number) => void) | null>(null);
  useLayoutEffect(() => {
    if (camera instanceof PerspectiveCamera && size.width > 0 && size.height > 0) {
      runtime.dispatch({ type: 'set-viewport', verticalFovRad: camera.fov * Math.PI / 180, aspect: size.width / size.height });
    }
  }, [runtime, camera, size.width, size.height]);

  useEffect(() => {
    if (!(camera instanceof PerspectiveCamera)) throw new Error('Solar requires a perspective camera');
    const callbacks = () => propsRef.current;
    const canvas = gl.domElement as DiagnosticCanvas;
    let quality = callbacks().quality;
    let scene = createSolarScene(runtime.getCatalog(), quality);
    const orbits = createOrbitGuides(runtime.getCatalog(), message => callbacks().onError(message));
    const spacecraft = createSpacecraftScene(runtime.getCatalog());
    scene.scene.add(orbits.group, spacecraft.group);
    const cache = new TextureCache<Texture>({ load: loadTexture });
    let textures = new SceneTextures(cache, quality);
    const input = createInputController(canvas, () => callbacks().inputEnabled, () => runtime.getSnapshot().navigation.mode);
    let dirty = true, fatal = false, didHide = false, skipDelta = true;
    let elapsed = 0, frames = 0, lastStatus = '', lastError = '', lastFocusCheck = 0;
    const labels = new Map<BodyId, HTMLButtonElement>();
    const labelListeners: (() => void)[] = [];
    for (const id of BODY_IDS) {
      const button = document.createElement('button');
      button.className = 'celestial-label'; button.textContent = runtime.getCatalog()[id].nameZh;
      button.setAttribute('aria-label', `定位${runtime.getCatalog()[id].nameZh}`);
      button.style.display = 'none';
      const select = () => {
        if (callbacks().inputEnabled) runtime.dispatch({ type: 'select', id });
      };
      button.addEventListener('click', select);
      labelListeners.push(() => button.removeEventListener('click', select));
      labels.set(id, button); labelsRef.current?.appendChild(button);
    }
    const spacecraftLabel = document.createElement('button');
    spacecraftLabel.className = 'celestial-label spacecraft-label';
    spacecraftLabel.textContent = '旅行者1号';
    spacecraftLabel.setAttribute('aria-label', '定位旅行者1号');
    const selectSpacecraft = () => {
      if (callbacks().inputEnabled && runtime.getSnapshot().spacecraftState) runtime.dispatch({ type: 'select-spacecraft', id: 'voyager-1' });
    };
    spacecraftLabel.addEventListener('click', selectSpacecraft);
    const initial = runtime.getSnapshot();
    const diagnostics: SolarDiagnostics = { frameTimesMs: new Float32Array(7200), sampleCount: 0, nextIndex: 0,
      renderCalls: 0, triangles: 0, points: 0, drawingBuffer: { width: canvas.width, height: canvas.height },
      cacheBytes: 0, selected: getSelectedBodyId(initial.selection), context: 'ready', frameCallbacks: 0, updateCount: 0,
      rawDeltaSeconds: 0, appliedDeltaSeconds: 0, navigation: initial.navigation, clock: initial.clock, issue: initial.issue,
      replayActive: false, trajectoryStatus: initial.trajectory.kind, spacecraftState: null,
      jupiterPositionKm: initial.world.bodies.jupiter.positionKm, trajectoryVertices: 0, spacecraftScreen: null };
    canvas.__solarDiagnostics = diagnostics;
    canvas.setAttribute('aria-label', '可交互的太阳系三维场景');
    const recovery = attachGraphicsRecovery(canvas, (state, error) => {
      diagnostics.context = state; setGraphics(state);
      input.clearInput();
      if (state === 'ready') { callbacks().onError(null); dirty = true; skipDelta = true; }
      else callbacks().onError(error ? `GPU 资源重建失败：${error instanceof Error ? error.message : String(error)}` : '渲染暂时中断；模拟状态已保留');
    }, () => {
      cache.forEachReady(texture => { texture.needsUpdate = true; });
      scene.restore();
      fatal = false;
    });
    const unsubscribe = cache.subscribe(() => { dirty = true; });
    retryRef.current = () => { cache.retryFailed(); dirty = true; };
    const visibility = () => {
      input.clearInput();
      if (document.hidden) {
        if (!runtime.getSnapshot().clock.hidden) { runtime.dispatch({ type: 'set-hidden', hidden: true }); didHide = true; }
      } else {
        if (didHide) { runtime.dispatch({ type: 'set-hidden', hidden: false }); didHide = false; }
        skipDelta = true;
      }
    };
    document.addEventListener('visibilitychange', visibility); visibility();

    const raycaster = new Raycaster(), pointer = new Vector2();
    let pointerStart: { x: number; y: number; id: number; moved: boolean } | null = null;
    const pointerDown = (event: PointerEvent) => {
      if (event.button === 0) pointerStart = { x: event.clientX, y: event.clientY, id: event.pointerId, moved: false };
    };
    const pointerMove = (event: PointerEvent) => {
      if (pointerStart && event.pointerId === pointerStart.id &&
          Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > DRAG_THRESHOLD_PX) {
        pointerStart.moved = true;
      }
    };
    const cancelSelection = () => { pointerStart = null; };
    const pointerUp = (event: PointerEvent) => {
      const start = pointerStart; pointerStart = null;
      if (!start || start.moved || event.target !== canvas || event.button !== 0 || start.id !== event.pointerId ||
          Math.hypot(event.clientX - start.x, event.clientY - start.y) > DRAG_THRESHOLD_PX || !callbacks().inputEnabled || recovery.suspended()) return;
      try {
        const bounds = canvas.getBoundingClientRect();
        const marker = diagnostics.spacecraftScreen;
        if (marker?.visible && Math.hypot(event.clientX - bounds.left - marker.x, event.clientY - bounds.top - marker.y) <= 8) {
          selectSpacecraft(); return;
        }
        pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1, 1 - (event.clientY - bounds.top) / bounds.height * 2);
        raycaster.setFromCamera(pointer, camera);
        const hit = raycaster.intersectObjects(scene.pickable, false)[0];
        if (hit) runtime.dispatch({ type: 'select', id: hit.object.userData.bodyId as BodyId });
      } catch (error) { callbacks().onError(`天体选择失败：${error instanceof Error ? error.message : String(error)}`); }
    };
    canvas.addEventListener('pointerdown', pointerDown);
    canvas.addEventListener('pointercancel', cancelSelection);
    window.addEventListener('pointermove', pointerMove);
    window.addEventListener('pointerup', pointerUp);
    window.addEventListener('blur', cancelSelection);
    const oldShaderError = gl.debug.onShaderError;
    gl.debug.onShaderError = (context, program, vertex, fragment) => {
      fatal = true;
      callbacks().onError(`图形着色器编译失败：${context.getProgramInfoLog(program) || context.getShaderInfoLog(vertex) || context.getShaderInfoLog(fragment) || '未知错误'}`);
      setGraphics('failed');
    };
    const oldAutoClear = gl.autoClear, oldInfoReset = gl.info.autoReset;
    gl.autoClear = false; gl.info.autoReset = false;
    const projected = new Vector3();
    loop.current = rawDelta => {
      diagnostics.frameCallbacks++;
      diagnostics.rawDeltaSeconds = rawDelta;
      if (fatal || recovery.suspended() || document.hidden) { input.clearInput(); return; }
      try {
        if (quality !== callbacks().quality) {
          quality = callbacks().quality;
          const replacement = createSolarScene(runtime.getCatalog(), quality);
          scene.scene.remove(orbits.group, spacecraft.group);
          scene.dispose(); textures.dispose();
          scene = replacement; scene.scene.add(orbits.group, spacecraft.group);
          textures = new SceneTextures(cache, quality);
          dirty = true; lastFocusCheck = 0.5;
        }
        const size = sizeRef.current;
        const resumed = recovery.consumeResume() || skipDelta;
        skipDelta = false;
        const delta = resumed ? 0 : rawDelta;
        const frame = advanceFrame(runtime, input, delta, callbacks().inputEnabled, false, resumed);
        diagnostics.updateCount++;
        diagnostics.appliedDeltaSeconds = delta;
        diagnostics.navigation = frame.navigation;
        diagnostics.clock = frame.clock;
        diagnostics.issue = frame.issue;
        diagnostics.replayActive = frame.replayActive;
        diagnostics.trajectoryStatus = frame.trajectory.kind;
        diagnostics.spacecraftState = frame.spacecraftState;
        diagnostics.jupiterPositionKm = frame.world.bodies.jupiter.positionKm;
        if (dirty) {
          dirty = false;
          textures.reconcile();
          scene.setTextures(id => textures.get(id));
          const stats = cache.stats();
          const error = stats.errors.map(({ request }) => request.label ?? request.key).join('、');
          if (error !== lastError) {
            setTextureError(error);
            if (error) callbacks().onError(`纹理加载失败：${error}。当前显示基础或占位材质，可重试。`);
            else if (lastError) callbacks().onError(null);
            lastError = error;
          }
          const status = stats.loading || stats.queued ? `纹理加载中 · ${stats.ready} 项就绪，暂用基础或占位材质`
            : error ? '部分纹理不可用 · 可重试' : '';
          if (status !== lastStatus) { callbacks().onStatus(status); lastStatus = status; }
        }
        scene.update(frame, camera);
        orbits.update(frame);
        spacecraft.update(frame, camera);
        diagnostics.trajectoryVertices = spacecraft.vertexCount;
        const selectedBodyId = getSelectedBodyId(frame.selection);
        const spheres = [...scene.bodies.values()].map(body => ({ center: body.root.position, radius: body.root.scale.x }));
        diagnostics.spacecraftScreen = null;
        if (frame.spacecraftState) {
          const screen = labelProjection(spacecraft.position, camera, size.width, size.height);
          const visible = screen.visible && !isOccluded(spacecraft.position, spheres);
          diagnostics.spacecraftScreen = { x: screen.x, y: screen.y, visible };
          if (!spacecraftLabel.parentElement) labelsRef.current?.appendChild(spacecraftLabel);
          spacecraftLabel.style.display = visible && frame.guides.labelsVisible && frame.guides.hudVisible ? 'block' : 'none';
          spacecraftLabel.style.transform = `translate(${screen.x}px, ${screen.y - 20}px) translate(-50%, -50%)`;
          spacecraftLabel.disabled = !callbacks().inputEnabled;
          spacecraftLabel.classList.toggle('selected', frame.selection?.kind === 'spacecraft' && frame.selection.id === 'voyager-1');
        } else spacecraftLabel.remove();
        for (const [id, label] of labels) {
          const body = scene.bodies.get(id)!;
          const position = labelProjection(body.root.position, camera, size.width, size.height);
          const occluders = spheres.filter(s => s.center !== body.root.position);
          const visible = frame.guides.labelsVisible && frame.guides.hudVisible && position.visible && !isOccluded(body.root.position, occluders);
          label.style.display = visible ? 'block' : 'none';
          if (visible) {
            projected.copy(body.root.position).applyMatrix4(camera.matrixWorldInverse);
            const radiusPixels = Math.min(size.height * 0.35, body.root.scale.x / Math.max(0.0001, -projected.z) * size.height / (2 * Math.tan(camera.fov * Math.PI / 360)));
            label.style.transform = `translate(${position.x}px, ${Math.max(18, position.y - radiusPixels - 16)}px) translate(-50%, -50%)`;
            label.classList.toggle('selected', id === selectedBodyId);
            label.disabled = !callbacks().inputEnabled;
          }
        }
        gl.info.reset();
        gl.clear();
        gl.render(scene.background, scene.backgroundCamera);
        gl.clearDepth();
        gl.render(scene.scene, camera);
        if (rawDelta > 0 && !resumed) {
          diagnostics.frameTimesMs[diagnostics.nextIndex] = rawDelta * 1000;
          diagnostics.nextIndex = (diagnostics.nextIndex + 1) % diagnostics.frameTimesMs.length;
          diagnostics.sampleCount++;
        }
        diagnostics.selected = selectedBodyId;
        diagnostics.renderCalls = gl.info.render.calls;
        diagnostics.triangles = gl.info.render.triangles; diagnostics.points = gl.info.render.points;
        diagnostics.drawingBuffer.width = canvas.width; diagnostics.drawingBuffer.height = canvas.height;
        frames++; elapsed += delta; lastFocusCheck += delta;
        if (lastFocusCheck >= 0.5 || diagnostics.sampleCount === 0) {
          lastFocusCheck = 0;
          let focus = selectedBodyId, distance = Infinity;
          if (!focus) for (const [id, body] of scene.bodies) {
              const normalized = body.root.position.length() / body.root.scale.x;
              if (normalized < distance && normalized < 12) { focus = id; distance = normalized; }
            }
          textures.setFocus(focus);
          orbits.request(frame.clock.julianDay);
        }
        if (elapsed >= 1) {
          diagnostics.cacheBytes = cache.stats().estimatedBytes;
          callbacks().onStats({ fps: Math.round(frames / elapsed), textures: gl.info.memory.textures,
            geometries: gl.info.memory.geometries, estimatedBytes: diagnostics.cacheBytes });
          frames = 0; elapsed = 0;
        }
      } catch (error) {
        fatal = true; setGraphics('failed');
        callbacks().onError(`场景更新失败：${error instanceof Error ? error.message : String(error)}`);
      }
    };
    return () => {
      loop.current = null; retryRef.current = null;
      document.removeEventListener('visibilitychange', visibility);
      if (didHide) runtime.dispatch({ type: 'set-hidden', hidden: false });
      canvas.removeEventListener('pointerdown', pointerDown); canvas.removeEventListener('pointercancel', cancelSelection);
      window.removeEventListener('pointermove', pointerMove); window.removeEventListener('pointerup', pointerUp);
      window.removeEventListener('blur', cancelSelection);
      labelListeners.forEach(remove => remove());
      labels.forEach(label => label.remove());
      spacecraftLabel.removeEventListener('click', selectSpacecraft); spacecraftLabel.remove();
      input.dispose(); recovery.dispose(); unsubscribe(); textures.dispose(); cache.dispose();
      scene.scene.remove(orbits.group, spacecraft.group); orbits.dispose(); spacecraft.dispose(); scene.dispose();
      gl.autoClear = oldAutoClear; gl.info.autoReset = oldInfoReset; gl.debug.onShaderError = oldShaderError;
      delete canvas.__solarDiagnostics;
    };
  }, [gl, camera, runtime, propsRef, labelsRef, retryRef, setGraphics, setTextureError]);
  // Positive priority takes over Fiber's existing loop, not an additional RAF.
  useFrame((_state, delta) => loop.current?.(delta), 1);
  return null;
}

export function SolarCanvas(props: SolarCanvasProps): ReactNode {
  const propsRef = useRef(props); propsRef.current = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null), retryRef = useRef<(() => void) | null>(null);
  const [graphics, setGraphics] = useState<GraphicsState>('ready');
  const [textureError, setTextureError] = useState('');
  const [viewport, setViewport] = useState({ width: 0, height: 0, dpr: 1 });
  useLayoutEffect(() => {
    const host = containerRef.current!;
    const update = () => {
      const bounds = host.getBoundingClientRect();
      const next = { width: bounds.width, height: bounds.height, dpr: window.devicePixelRatio || 1 };
      setViewport(current => current.width === next.width && current.height === next.height && current.dpr === next.dpr ? current : next);
    };
    const observer = new ResizeObserver(update);
    observer.observe(host);
    window.addEventListener('resize', update);
    update();
    return () => { observer.disconnect(); window.removeEventListener('resize', update); };
  }, []);
  const dpr = cappedPixelRatio(viewport.width, viewport.height, viewport.dpr, props.quality);
  return <div ref={containerRef} className="solar-renderer">
    <SceneBoundary onError={props.onError}>
      <Canvas dpr={dpr} camera={{ fov: 60, near: 0.001, far: 1e7 }}
        gl={{ antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance',
          toneMapping: ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
        fallback={<div className="renderer-failure" role="alert">此浏览器不支持 WebGL 图形场景，请启用 Chrome 硬件加速。</div>}>
        <SceneDriver propsRef={propsRef} labelsRef={labelsRef} retryRef={retryRef}
          setGraphics={setGraphics} setTextureError={setTextureError} />
      </Canvas>
    </SceneBoundary>
    <div ref={labelsRef} className="celestial-label-layer" />
    {textureError && <div className="texture-retry-panel" role="status">
      <span>{textureError}纹理不可用 · 正在显示基础或占位材质</span>
      <button onClick={() => retryRef.current?.()}>重试纹理</button>
    </div>}
    {graphics !== 'ready' && <div className="renderer-failure" role="alert">
      <h2>{graphics === 'lost' ? '图形上下文已丢失，正在恢复…' : '图形上下文恢复失败'}</h2>
      <p>模拟时间、相机和当前目标已保留。</p>
      {graphics === 'failed' && <button onClick={() => window.location.reload()}>重新加载</button>}
    </div>}
  </div>;
}
