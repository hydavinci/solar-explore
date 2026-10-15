import { useState } from 'react';
import type { BodyId, Catalog } from '../simulation/types';
import type { Selection } from '../rendering/runtime';
import { spacecraftCatalog, type SpacecraftId } from '../spacecraft/catalog';
import { bodyInfo } from './body-info';

interface Props {
  catalog: Catalog;
  selected: Selection | null;
  onSelect: (id: BodyId) => void;
  onSelectSpacecraft: (id: SpacecraftId) => void;
}

export function SearchPanel({ catalog, selected, onSelect, onSelectSpacecraft }: Props) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'body' | 'spacecraft'>('body');
  const changeCategory = (next: typeof category) => { setCategory(next); setQuery(''); };
  const isSelected = (kind: Selection['kind'], id: string) => selected?.kind === kind && selected.id === id;
  const entries = Object.values(catalog).filter(body =>
    `${body.nameZh} ${body.nameEn}`.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const spacecraft = Object.values(spacecraftCatalog).filter(craft =>
    `${craft.nameZh} ${craft.nameEn}`.toLowerCase().includes(query.trim().toLowerCase()),
  );
  return <aside className="explorer panel" aria-label="探索导航">
    <div className="panel-heading"><span>探索太阳系</span><span className="eyebrow">{category === 'body' ? '10 OBJECTS' : '6 MISSIONS'}</span></div>
    <div className="explorer-tabs" role="tablist" aria-label="对象类别" onKeyDown={event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 'body' : event.key === 'End' ? 'spacecraft' : category === 'body' ? 'spacecraft' : 'body';
      changeCategory(next); document.getElementById(`explorer-tab-${next}`)?.focus();
    }}>
      <button id="explorer-tab-body" role="tab" aria-selected={category === 'body'} aria-controls="explorer-results"
        tabIndex={category === 'body' ? 0 : -1} onClick={() => changeCategory('body')}>天体</button>
      <button id="explorer-tab-spacecraft" role="tab" aria-selected={category === 'spacecraft'} aria-controls="explorer-results"
        tabIndex={category === 'spacecraft' ? 0 : -1} onClick={() => changeCategory('spacecraft')}>航天器</button>
    </div>
    <label className="search-field">
      <span aria-hidden="true">⌕</span>
      <input type="search" aria-label={category === 'body' ? '搜索天体' : '搜索航天器'}
        placeholder={category === 'body' ? '搜索天体 / Search' : '搜索航天器 / Search'} value={query}
        onChange={event => setQuery(event.target.value)} />
      <kbd>/</kbd>
    </label>
    <div className="body-list" id="explorer-results" role="tabpanel" aria-labelledby={`explorer-tab-${category}`}>
      {category === 'body' ? entries.map(body => <button key={body.id} className={`body-row ${isSelected('body', body.id) ? 'selected' : ''}`}
        aria-label={`选择${body.nameZh}`} aria-pressed={isSelected('body', body.id)} onClick={() => onSelect(body.id)}>
        <span className={`planet-thumbnail thumb-${body.id}`} style={{
          backgroundColor: bodyInfo[body.id].color,
          backgroundImage: `url("${import.meta.env.BASE_URL}assets/base/2k_${bodyInfo[body.id].dayMap}.jpg")`,
        }} aria-hidden="true" />
        <span className="body-names"><span>{body.nameZh}</span><small>{body.nameEn}</small></span>
        <span className="body-indicator">{isSelected('body', body.id) ? '●' : '›'}</span>
      </button>) : spacecraft.map(craft => <button key={craft.id} className={`body-row spacecraft-row ${isSelected('spacecraft', craft.id) ? 'selected' : ''}`}
        aria-label={`选择${craft.nameZh}`} aria-pressed={isSelected('spacecraft', craft.id)} onClick={() => onSelectSpacecraft(craft.id)}>
        <svg className="spacecraft-icon" viewBox="0 0 32 32" fill="none" stroke="currentColor" aria-hidden="true">
          <path d="M13 14h6v9h-6zM2 16h9v5H2zM21 16h9v5h-9zM11 18h2m6 0h2M9 6a7 7 0 0 0 14 0zM16 6v8" />
        </svg>
        <span className="body-names"><span>{craft.nameZh}</span><small>{craft.nameEn}</small></span>
        <span className="body-indicator">{isSelected('spacecraft', craft.id) ? '●' : '›'}</span>
      </button>)}
      {category === 'body' && !entries.length && <p className="empty-state">没有匹配的天体<br /><small>试试“地球”或 Earth</small></p>}
      {category === 'spacecraft' && !spacecraft.length && <p className="empty-state">没有匹配的航天器<br /><small>试试“朱诺号”或 Juno</small></p>}
    </div>
    <div className="explorer-footer"><span className="status-dot" />{category === 'body' ? '日心参考系' : '资料 · 历史轨迹'}
      <span>{category === 'body' ? 'J2000' : `${Object.values(spacecraftCatalog).filter(c => c.trajectory.kind === 'published').length} TRACK`}</span>
    </div>
  </aside>;
}
