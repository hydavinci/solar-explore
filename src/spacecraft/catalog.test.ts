import { expect, it } from 'vitest';
import { isBodyId } from '../simulation/types';
import { isSpacecraftId, spacecraftCatalog } from './catalog';

it('provides the six requested missions with the correct launch dates', () => {
  expect(Object.values(spacecraftCatalog).map(c => [c.id, c.launchDate])).toEqual([
    ['voyager-1', '1977-09-05'], ['voyager-2', '1977-08-20'],
    ['cassini', '1997-10-15'], ['juno', '2011-08-05'],
    ['new-horizons', '2006-01-19'], ['tianwen-1', '2020-07-23'],
  ]);
});

it('does not invent coordinates or date coverage for missing trajectories', () => {
  for (const craft of Object.values(spacecraftCatalog)) {
    if (craft.id === 'voyager-1') {
      expect(craft.trajectory.kind).toBe('published');
    } else {
      expect(craft.trajectory.kind).toBe('missing');
      if (craft.trajectory.kind === 'missing') expect(craft.trajectory.reason.length).toBeGreaterThan(0);
    }
    expect(craft.trajectory).not.toHaveProperty('positionKm');
    expect(craft.trajectory).not.toHaveProperty('startJulianDay');
  }
});

it('rejects nonmembers, including inherited object keys', () => {
  expect(isSpacecraftId('voyager-1')).toBe(true);
  for (const value of ['earth', '__proto__', 'toString', '', null, 1]) {
    expect(isSpacecraftId(value)).toBe(false);
  }
});

it('supplies sourced information and valid related bodies for every detail panel', () => {
  for (const craft of Object.values(spacecraftCatalog)) {
    expect(craft.nameZh).not.toBe('');
    expect(craft.nameEn).not.toBe('');
    expect(craft.agency).not.toBe('');
    expect(craft.summary).not.toBe('');
    expect(craft.events.length).toBeGreaterThan(0);
    expect(craft.events.every(event => event.dateLabel && event.text)).toBe(true);
    expect(craft.sources.length).toBeGreaterThan(0);
    for (const source of craft.sources) {
      const url = new URL(source.url);
      expect(url.protocol).toBe('https:');
      expect(['science.nasa.gov', 'www.nasa.gov', 'www.cnsa.gov.cn']).toContain(url.hostname);
      expect(source.label).not.toBe('');
    }
    expect(craft.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number.isFinite(Date.parse(craft.verifiedAt))).toBe(true);
    expect(craft.relatedBodyIds.length).toBeGreaterThan(0);
    expect(craft.relatedBodyIds.every(isBodyId)).toBe(true);
  }
  expect(spacecraftCatalog['tianwen-1'].model).toBe('tianwen-orbiter');
  expect(spacecraftCatalog['tianwen-1'].summary).toContain('环绕器');
});
