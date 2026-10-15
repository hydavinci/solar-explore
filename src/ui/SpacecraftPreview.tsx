import { Component, useEffect, useRef, useState, type ReactNode } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import type { Group } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { SpacecraftDefinition, SpacecraftModelKind } from '../spacecraft/catalog';
import { createSpacecraftModel } from '../spacecraft/models';

function PreviewFailure({ message }: { message: string }) {
  return <div className="preview-failure" role="alert"><strong>模型预览不可用</strong><p>{message}</p></div>;
}
class PreviewBoundary extends Component<{ children: ReactNode }, { message: string | null }> {
  state: { message: string | null } = { message: null };
  static getDerivedStateFromError(error: Error) {
    return { message: `模型预览初始化失败：${error.message}。请关闭后重新打开。` };
  }
  render() {
    return this.state.message ? <PreviewFailure message={this.state.message} /> : this.props.children;
  }
}
function PreviewModel({ kind, onError }: { kind: SpacecraftModelKind; onError: (message: string) => void }) {
  const { camera, gl, invalidate } = useThree();
  const container = useRef<Group>(null);
  useEffect(() => {
    const parent = container.current;
    if (!parent) throw new Error('模型预览容器未初始化');
    const model = createSpacecraftModel(kind);
    parent.add(model.root);
    invalidate();
    return () => { parent.remove(model.root); model.dispose(); };
  }, [kind, invalidate]);
  useEffect(() => {
    const controls = new OrbitControls(camera, gl.domElement);
    controls.enablePan = false; controls.enableDamping = false;
    controls.minDistance = 2; controls.maxDistance = 12;
    const changed = () => invalidate();
    controls.addEventListener('change', changed);
    controls.update();
    return () => { controls.removeEventListener('change', changed); controls.dispose(); };
  }, [camera, gl, invalidate]);
  useEffect(() => {
    const canvas = gl.domElement;
    canvas.setAttribute('aria-label', '可旋转和缩放的航天器模型');
    canvas.tabIndex = 0;
    const lost = (event: Event) => {
      event.preventDefault();
      onError('模型预览图形上下文已丢失，请关闭后重新打开。');
    };
    const oldShaderError = gl.debug.onShaderError;
    gl.debug.onShaderError = (context, program, vertex, fragment) => onError(
      `模型预览着色器编译失败：${context.getProgramInfoLog(program) || context.getShaderInfoLog(vertex) || context.getShaderInfoLog(fragment) || '未知错误'}`,
    );
    canvas.addEventListener('webglcontextlost', lost);
    return () => { canvas.removeEventListener('webglcontextlost', lost); gl.debug.onShaderError = oldShaderError; };
  }, [gl, onError]);
  return <group ref={container} />;
}

export function SpacecraftPreview({ spacecraft, close }: { spacecraft: SpacecraftDefinition; close: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLElement>(null), closeRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    // Keep the opener across StrictMode's setup/cleanup replay while the HUD is inert.
    if (!returnFocus.current && document.activeElement instanceof HTMLElement) returnFocus.current = document.activeElement;
    closeRef.current?.focus();
    return () => { if (returnFocus.current?.isConnected) returnFocus.current.focus(); };
  }, []);
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
    <section ref={dialogRef} className="modal panel spacecraft-preview" role="dialog" aria-modal="true"
      aria-label={`${spacecraft.nameZh}模型预览`} aria-describedby="preview-disclaimer"
      onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); close(); return; }
        if (event.key !== 'Tab') return;
        const focusable = dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), [tabindex="0"]');
        const first = focusable?.[0], last = focusable?.[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}>
      <div className="panel-heading"><span>SPACECRAFT / 外观预览</span>
        <button ref={closeRef} className="icon-button" onClick={close} aria-label="关闭模型预览">×</button></div>
      <h2>{spacecraft.nameZh} <small>{spacecraft.nameEn}</small></h2>
      <div className="preview-viewport">
        <PreviewBoundary>
          {error ? <PreviewFailure message={error} /> : <Canvas frameloop="demand" dpr={[1, 1.5]}
            camera={{ position: [3, 2, 4], fov: 40, near: 0.01, far: 100 }}
            fallback={<PreviewFailure message="浏览器无法创建 WebGL 场景，请检查硬件加速设置。" />}>
            <color attach="background" args={['#080f1b']} />
            <ambientLight intensity={1.6} />
            <directionalLight position={[4, 6, 5]} intensity={3} />
            <directionalLight position={[-4, 2, -3]} intensity={1.8} color="#91b6eb" />
            <PreviewModel kind={spacecraft.model} onError={setError} />
          </Canvas>}
        </PreviewBoundary>
      </div>
      <div className="preview-footer"><span>左键旋转 · 滚轮缩放 · Esc 关闭</span><span>独立预览，不改变主场景</span></div>
      <p id="preview-disclaimer" className="notice">外观示意，非工程模型；姿态非实时姿态。
        {spacecraft.model === 'tianwen-orbiter' && ' 天问一号模型仅表示环绕器。'}</p>
    </section>
  </div>;
}
