import type { SpacecraftDefinition } from '../spacecraft/catalog';
import { catalog } from '../simulation/catalog';
import { spacecraftAvailability, type FrameSnapshot, type RuntimeCommand } from '../rendering/runtime';
import { trajectoryManifest } from '../spacecraft/trajectory';
import { length, sub } from '../simulation/vector';
import { formatDistance } from './format';

export function SpacecraftPanel({ spacecraft, onPreview, snapshot, dispatch }: {
  spacecraft: SpacecraftDefinition; onPreview: () => void; snapshot: FrameSnapshot; dispatch: (command: RuntimeCommand) => void;
}) {
  const availability = spacecraftAvailability(snapshot, spacecraft.id);
  const published = spacecraft.trajectory.kind === 'published';
  const active = spacecraft.id === 'voyager-1' && snapshot.replayActive && snapshot.spacecraftState !== null;
  const labels = { missing: '暂无可用轨迹', loading: '正在加载历史轨迹', error: '轨迹加载失败', 'out-of-range': '当前日期无轨迹',
    available: active ? '历史回放已启用' : '可回放当前日期' };
  const utc = (ms: number) => new Date(ms).toISOString();
  return <section className="target-panel spacecraft-panel panel" aria-label="航天器资料">
    <span className="eyebrow target-eyebrow">MISSION ARCHIVE</span>
    <h1 data-testid="selected-spacecraft">{spacecraft.nameZh}</h1>
    <div className="target-english">{spacecraft.nameEn}</div>
    <div className="trajectory-status">
      <strong data-testid="trajectory-status">{labels[availability]}</strong>
      <p id="trajectory-explanation">{spacecraft.trajectory.kind === 'missing' ? spacecraft.trajectory.reason
        : `${utc(trajectoryManifest.coverage[0]![0]!).slice(0, 10)} — ${utc(trajectoryManifest.coverage.at(-1)![1]!).slice(0, 10)} UTC · 木星飞掠历史导航星历`}</p>
      {published && <p>{active ? '定位点非实际尺寸，非实时位置。' : '需主动回放，不代表当前位置。'}</p>}
      {availability === 'error' && snapshot.trajectory.kind === 'error' && <p role="alert">{snapshot.trajectory.message}</p>}
    </div>
    <div className={`spacecraft-actions${published ? ' trajectory-actions' : ''}`}>
      {published && <button className="primary-button" disabled={snapshot.trajectory.kind !== 'ready'}
        onClick={() => dispatch({ type: 'enter-replay' })}>回放木星飞掠</button>}
      {published && availability === 'available' && !active && <button className="quiet-button"
        onClick={() => dispatch({ type: 'activate-spacecraft', id: spacecraft.id })}>使用当前日期回放</button>}
      {availability === 'error' && <button className="quiet-button" onClick={() => dispatch({ type: 'load-trajectory' })}>重试轨迹加载</button>}
      <button className={published ? 'quiet-button' : 'primary-button'} onClick={onPreview}>查看三维模型 <span aria-hidden="true">↗</span></button>
      <button className="quiet-button" disabled={!active} aria-describedby="trajectory-explanation"
        onClick={() => dispatch({ type: 'fly-to-spacecraft', id: spacecraft.id })}>飞向航天器</button>
      {active && <button className="quiet-button" onClick={() => dispatch({ type: 'exit-replay' })}>退出历史回放</button>}
    </div>
    <div className="spacecraft-details">
      {active && snapshot.spacecraftState && <dl className="trajectory-distances">
        <dt>距航天器</dt><dd>{formatDistance(length(sub(snapshot.navigation.positionKm, snapshot.spacecraftState.spacecraft.positionKm)))}</dd>
        <dt>距木星中心</dt><dd>{formatDistance(length(sub(snapshot.spacecraftState.spacecraft.positionKm, snapshot.spacecraftState.jupiter.positionKm)))}</dd>
      </dl>}
      {published && <details className="trajectory-coverage">
        <summary>覆盖分段与数据来源</summary>
        <p>定位点非实际尺寸；木星采用同源位置。示意模式使用木星局部尺度。</p>
        <ol>{trajectoryManifest.coverage.map(([start, end]) =>
          <li key={start}>{utc(start!)}<br />至 {utc(end!)}</li>)}</ol>
        <p>段间毫秒级空隙是导入边界保护窗口，不是原始档案缺失。</p>
        <p>早期导航档案未逐段标明重建/预测属性；不代表实时位置或精密定轨。最大实测源重现误差约 {trajectoryManifest.validation.maximumPositionError.spacecraftKm.toFixed(3)} km，不是绝对轨迹精度。</p>
        <a href={trajectoryManifest.catalogUrl} target="_blank" rel="noopener noreferrer">NASA PDS：星历档案 ↗</a>
      </details>}
      <dl><dt>发射日期</dt><dd><time dateTime={spacecraft.launchDate}>{spacecraft.launchDate}</time></dd>
        <dt>机构</dt><dd>{spacecraft.agency}</dd>
        <dt>相关天体</dt><dd>{spacecraft.relatedBodyIds.map(id => catalog[id].nameZh).join('、')}</dd></dl>
      <p>{spacecraft.summary}</p>
      <h2>主要事件</h2>
      <ol className="mission-events">{spacecraft.events.map(event =>
        <li key={event.dateLabel}><span>{event.dateLabel}</span><p>{event.text}</p></li>)}</ol>
      <h2>官方来源</h2>
      <ul className="mission-sources">{spacecraft.sources.map(source =>
        <li key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.label} ↗</a></li>)}</ul>
      <p className="muted">资料核验：{spacecraft.verifiedAt}<br />静态任务资料，不随模拟时钟变化。</p>
    </div>
  </section>;
}
