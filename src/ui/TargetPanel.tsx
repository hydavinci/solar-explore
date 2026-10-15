import { useState } from 'react';
import type { BodyDefinition } from '../simulation/types';
import type { RuntimeCommand } from '../rendering/runtime';
import { bodyInfo } from './body-info';
import { formatDistance } from './format';

export function TargetPanel({ body, distanceKm, dispatch }: {
  body: BodyDefinition;
  distanceKm: number;
  dispatch: (command: RuntimeCommand) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const info = bodyInfo[body.id];
  return <section className="target-panel" aria-label="选中天体">
    <span className="eyebrow target-eyebrow"><span className="crosshair-mark">⊕</span> SELECTED OBJECT</span>
    <h1 data-testid="selected-body">{body.nameZh}</h1>
    <div className="target-english">{body.nameEn.toUpperCase()} <span> / {info.category}</span></div>
    <div className="distance-caption"><span>距表面</span><strong>{formatDistance(Math.max(0, distanceKm))}</strong></div>
    <button className="primary-button fly-button" aria-label="飞向天体" onClick={() => dispatch({ type: 'fly-to', id: body.id })}>飞向天体 <span>↗</span><kbd>G</kbd></button>
    <button className="info-toggle" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>天体资料 <span>{expanded ? '−' : '+'}</span></button>
    {expanded && <div className="target-details panel">
      <p>{info.description}</p>
      <dl><dt>参考半径</dt><dd>{formatDistance(body.radiusKm)}</dd><dt>自转周期（近似）</dt><dd>{Math.abs(body.rotationPeriodDays).toFixed(2)} 地球日</dd></dl>
      <small>轨道：Astronomy Engine<br />图像：Solar System Scope / INOVE</small>
    </div>}
  </section>;
}
