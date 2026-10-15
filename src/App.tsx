import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { createRuntime, getSelectedBodyId } from './rendering/runtime';
import { catalog } from './simulation/catalog';
import { evaluateWorld } from './simulation/world';
import { SolarCanvas } from './rendering/SolarCanvas';
import type { Quality } from './rendering/quality';
import { SearchPanel } from './ui/SearchPanel';
import { TargetPanel } from './ui/TargetPanel';
import { TimeControls } from './ui/TimeControls';
import { HelpPanel } from './ui/HelpPanel';
import { CreditsPanel } from './ui/CreditsPanel';
import { formatDistance } from './ui/format';
import { length, sub } from './simulation/vector';
import { spacecraftCatalog, type SpacecraftId } from './spacecraft/catalog';
import { SpacecraftPanel } from './ui/SpacecraftPanel';
import { SpacecraftPreview } from './ui/SpacecraftPreview';

const modeLabels = { free: '自由飞行', orbit: '环绕观察', follow: '跟随天体', flight: '正在飞向' };

export default function App() {
  const [runtime] = useState(() => createRuntime(catalog, evaluateWorld));
  const subscribe = useCallback((listener: () => void) => runtime.subscribe(listener), [runtime]);
  const getSnapshot = useCallback(() => runtime.getSnapshot(), [runtime]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot);
  const dispatch = useCallback((command: Parameters<typeof runtime.dispatch>[0]) => runtime.dispatch(command), [runtime]);
  const [quality, setQuality] = useState<Quality>('standard');
  const [help, setHelp] = useState(false);
  const [credits, setCredits] = useState(false);
  const [settings, setSettings] = useState(false);
  const [previewId, setPreviewId] = useState<SpacecraftId | null>(null);
  const closePreview = useCallback(() => setPreviewId(null), []);
  const [error, setError] = useState<string | null>(null);
  const [resourceStatus, setResourceStatus] = useState('');
  const [stats, setStats] = useState({ fps: 0, textures: 0, geometries: 0, estimatedBytes: 0 });
  const [diagnostics, setDiagnostics] = useState(false);
  const { navigation, clock, guides } = snapshot;
  const selectedBodyId = getSelectedBodyId(snapshot.selection);
  const selected = selectedBodyId ? catalog[selectedBodyId] : null;
  const spacecraft = snapshot.selection?.kind === 'spacecraft' ? spacecraftCatalog[snapshot.selection.id] : null;
  const canNavigate = selectedBodyId !== null || (spacecraft?.id === 'voyager-1' && snapshot.spacecraftState !== null);
  const distance = selected ? length(sub(navigation.positionKm, snapshot.world.bodies[selected.id].positionKm)) - selected.radiusKm : 0;
  const setHudVisible = useCallback((visible: boolean) => {
    if (!visible) setSettings(false);
    dispatch({ type: 'set-guide', key: 'hudVisible', visible });
  }, [dispatch]);
  useEffect(() => {
    runtime.dispatch({ type: 'load-trajectory' });
    return () => runtime.cancelTrajectoryLoad();
  }, [runtime]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const element = event.target;
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (previewId) {
        if (event.key === 'Escape') { event.preventDefault(); closePreview(); }
        return;
      }
      if (element instanceof HTMLElement && (element.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(element.tagName))) return;
      if (event.key === 'Escape' && (help || credits || settings)) {
        event.preventDefault();
        setHelp(false); setCredits(false); setSettings(false);
        return;
      }
      if (help || credits) return;
      if (event.key.toLowerCase() === 'h') {
        const current = runtime.getSnapshot();
        setHudVisible(!current.guides.hudVisible);
      } else if (event.key.toLowerCase() === 'g') {
        const selection = runtime.getSnapshot().selection;
        const target = getSelectedBodyId(selection);
        if (selection?.kind === 'spacecraft') dispatch({ type: 'fly-to-spacecraft', id: selection.id });
        if (target) dispatch({ type: 'fly-to', id: target });
      } else if (event.key === '/') {
        event.preventDefault();
        document.querySelector<HTMLInputElement>('input[type="search"]')?.focus();
      }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [runtime, dispatch, help, credits, settings, setHudVisible, previewId, closePreview]);

  const issue = error ?? snapshot.issue?.message;
  return <main className="app">
    <div className="scene-container" data-testid="scene-container" inert={previewId !== null}>
      <SolarCanvas runtime={runtime} quality={quality} onError={setError} onStatus={setResourceStatus} onStats={setStats}
        inputEnabled={!help && !credits && !previewId && !(settings && guides.hudVisible)} />
    </div>
    <div className="scene-vignette" />
    {guides.hudVisible ? <div className="hud" inert={previewId !== null}>
      <header className="topbar">
        <div className="brand"><span className="brand-orbit" aria-hidden="true" /><span className="brand-word">SOLAR</span><span className="brand-divider" /><span className="brand-subtitle">太阳系探索计划</span></div>
        <div className="top-actions">
          <span className="live-badge"><span className="status-dot" />{stats.fps ? `${stats.fps} FPS` : 'EXPLORER'}</span>
          <button className="quiet-button" aria-label="画面设置" aria-expanded={settings} onClick={() => setSettings(!settings)}>☷ 画面设置</button>
          <button className="quiet-button" onClick={() => setHelp(true)}>操作指南</button>
          <button className="icon-button" aria-label="隐藏界面" title="隐藏界面 · H" onClick={() => setHudVisible(false)}>⛶</button>
        </div>
      </header>
      <SearchPanel catalog={catalog} selected={snapshot.selection} onSelect={id => dispatch({ type: 'fly-to', id })}
        onSelectSpacecraft={id => dispatch({ type: 'activate-spacecraft', id })} />
      {selected && <TargetPanel body={selected} distanceKm={distance} dispatch={dispatch} />}
      {spacecraft && <SpacecraftPanel spacecraft={spacecraft} snapshot={snapshot} dispatch={dispatch} onPreview={() => setPreviewId(spacecraft.id)} />}
      {snapshot.replayActive && <aside className="replay-banner panel" aria-label="历史回放状态">
        <span>旅行者1号 · 1979 历史回放</span><small>木星采用同源星历</small>
        <button className="quiet-button" aria-label="结束历史回放" onClick={() => dispatch({ type: 'exit-replay' })}>退出</button>
      </aside>}
      <div className="scene-hint">{navigation.mode === 'orbit' ? '左键拖动环绕 · 滚轮调整距离' : '右键拖动视角 · 滚轮调整速度'} <span> · </span> 单击选择天体</div>
      <nav className="navigation-strip panel" aria-label="漫游模式">
        <button className={navigation.mode === 'free' ? 'active' : ''} disabled={snapshot.scaleMode === 'schematic'}
          onClick={() => dispatch({ type: 'set-navigation', mode: 'free' })}>自由飞行</button>
        <button className={navigation.mode === 'orbit' ? 'active' : ''} disabled={!canNavigate}
          onClick={() => dispatch({ type: 'set-navigation', mode: 'orbit' })}>环绕</button>
        <button className={navigation.mode === 'follow' ? 'active' : ''} disabled={!canNavigate || snapshot.scaleMode === 'schematic'}
          onClick={() => dispatch({ type: 'set-navigation', mode: 'follow' })}>跟随</button>
        <span className="separator" />
        <button onClick={() => dispatch({ type: 'overview' })}>太阳系全景</button>
        <span className="separator" />
        <button className={snapshot.scaleMode === 'real' ? 'active' : ''} onClick={() => dispatch({ type: 'set-mode', mode: 'real' })}>真实尺度</button>
        <button className={snapshot.scaleMode === 'schematic' ? 'active' : ''} onClick={() => dispatch({ type: 'set-mode', mode: 'schematic' })}>示意模式</button>
      </nav>
      <div className="scene-status">
        <span data-testid="navigation-mode">{navigation.mode === 'follow' && navigation.target === 'voyager-1' ? '跟随航天器' : modeLabels[navigation.mode]}</span>
        <span data-testid="scale-label">{snapshot.scaleMode === 'real' ? '真实尺度 1:1' : snapshot.replayActive ? '示意模式：木星局部尺度' : '示意模式：尺寸与间距已调整'}</span>
      </div>
      <div className="navigation-speed" data-testid="navigation-speed" aria-label="飞行速度">速度 {formatDistance(navigation.speedKmPerSecond)}/s</div>
      <TimeControls clock={clock} dispatch={dispatch} onError={setError} />
      {settings && <section className="settings-popover panel" aria-label="画面设置">
        <label>画质<select aria-label="画质" value={quality} onChange={event => setQuality(event.target.value as Quality)}><option value="standard">标准 · 1080p</option><option value="low">流畅 · 720p</option></select></label>
        <label>天体标签<input type="checkbox" checked={guides.labelsVisible} onChange={event => dispatch({ type: 'set-guide', key: 'labelsVisible', visible: event.target.checked })} /></label>
        <label>轨道线<input type="checkbox" checked={guides.orbitsVisible} onChange={event => dispatch({ type: 'set-guide', key: 'orbitsVisible', visible: event.target.checked })} /></label>
        <label>诊断信息<input type="checkbox" checked={diagnostics} onChange={event => setDiagnostics(event.target.checked)} /></label>
        {diagnostics && <div className="diagnostics">FPS {stats.fps}{'\n'}Textures {stats.textures} · Meshes {stats.geometries}{'\n'}Cache {(stats.estimatedBytes / 1048576).toFixed(1)} MiB{'\n'}Speed {formatDistance(navigation.speedKmPerSecond)}/s</div>}
        <button className="quiet-button" onClick={() => { setCredits(true); setSettings(false); }}>关于与素材鸣谢 ↗</button>
      </section>}
      {resourceStatus && <div className="resource-status" role="status">{resourceStatus}</div>}
    </div> : <button className="hidden-hint" onClick={() => setHudVisible(true)}>按 H 显示界面</button>}
    {issue && <div className="status-message" role="alert">{issue}<button aria-label="关闭错误" onClick={() => {
      setError(null); dispatch({ type: 'clear-issue' });
    }}>×</button></div>}
    {help && <HelpPanel close={() => setHelp(false)} />}
    {credits && <CreditsPanel close={() => setCredits(false)} />}
    {previewId && <SpacecraftPreview key={previewId} spacecraft={spacecraftCatalog[previewId]} close={closePreview} />}
  </main>;
}
