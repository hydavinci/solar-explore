import { useState } from 'react';
import type { ClockState } from '../simulation/clock';
import { parseUtcDate, toUtcIso } from '../simulation/clock';
import type { RuntimeCommand } from '../rendering/runtime';
import { formatRate } from './format';

export function TimeControls({ clock, dispatch, onError }: {
  clock: ClockState;
  dispatch: (command: RuntimeCommand) => void;
  onError: (message: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState('');
  const rates = [-86400, -3600, -60, -1, 1, 60, 3600, 86400];
  return <footer className="time-panel panel">
    <div className="time-date">
      <span className="eyebrow">SIMULATION TIME <span className="utc-badge">UTC</span></span>
      <button className="date-button" aria-label="设置日期" onClick={() => {
        setDate(toUtcIso(clock.julianDay)); setEditing(!editing);
      }}><time data-testid="simulation-time">{toUtcIso(clock.julianDay).replace('T', ' ').replace('.000Z', '').replace('Z', '')}</time><span>⌄</span></button>
    </div>
    <div className="playback">
      <button className="icon-button" aria-label="倒放" title="倒放" onClick={() => dispatch({ type: 'set-rate', rate: -Math.abs(clock.rate) })}>↶</button>
      <button className="play-button" aria-label={clock.paused ? '继续' : '暂停'}
        onClick={() => dispatch({ type: 'set-paused', paused: !clock.paused })}>{clock.paused ? '▶' : 'Ⅱ'}</button>
      <button className="icon-button" aria-label="正向播放" title="正向播放" onClick={() => dispatch({ type: 'set-rate', rate: Math.abs(clock.rate) })}>↷</button>
      <select aria-label="时间速度" value={clock.rate} onChange={event => dispatch({ type: 'set-rate', rate: Number(event.target.value) })}>
        {rates.map(rate => <option key={rate} value={rate}>{formatRate(rate)}</option>)}
      </select>
    </div>
    <div className="time-right"><span className="muted">近似轨道 · 非精密星历</span>
      <button className="quiet-button" onClick={() => { dispatch({ type: 'set-date', julianDay: Date.now() / 86400000 + 2440587.5 }); dispatch({ type: 'set-rate', rate: 1 }); onError(null); }}>回到现在 ↗</button>
    </div>
    {editing && <form className="date-editor panel" onSubmit={event => {
      event.preventDefault();
      const result = parseUtcDate(date);
      if (!result.ok) { onError(result.message); return; }
      dispatch({ type: 'set-date', julianDay: result.julianDay }); onError(null); setEditing(false);
    }}>
      <label htmlFor="utc-input">模拟日期（UTC）</label>
      <input id="utc-input" value={date} onChange={event => setDate(event.target.value)} placeholder="2026-10-13T00:00:00Z" />
      <small>支持 1800-01-01 至 2050-01-01（不含）</small>
      <div><button type="button" className="quiet-button" onClick={() => setEditing(false)}>取消</button><button className="primary-button" type="submit">应用日期</button></div>
    </form>}
  </footer>;
}
