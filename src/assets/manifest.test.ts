import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import credits from '../../public/asset-credits.json';
import { assetRequest, textureManifest } from './manifest';

describe('published texture credits', () => {
  it('resolves both tiers under a static deployment subpath with decoded mip budgets', () => {
    for (const id of Object.keys(textureManifest) as (keyof typeof textureManifest)[]) {
      const base = assetRequest(id, 'base', '/solar/');
      const high = assetRequest(id, 'high', '/solar/');
      expect(base.url).toMatch(/^\/solar\/assets\/base\//);
      expect(high.url).toMatch(/^\/solar\/assets\/textures\//);
      expect(high.estimatedBytes).toBeGreaterThan(base.estimatedBytes);
      expect(credits.some(c => `/solar/${c.path}` === high.url)).toBe(true);
    }
  });
  it('accounts for both original and low-resolution assets', () => {
    expect(credits.length).toBe(28);
    expect(new Set(credits.map(entry => entry.path)).size).toBe(credits.length);
    for (const entry of credits) {
      expect(existsSync(`public/${entry.path}`)).toBe(true);
      expect(entry.author.length).toBeGreaterThan(0);
      expect(entry.license).toBe('CC BY 4.0');
      expect(entry.sourceUrl.startsWith('https://www.solarsystemscope.com/')).toBe(true);
      expect(entry.modifications.length).toBeGreaterThan(0);
    }
  });
  it('contains images rather than HTML download errors', () => {
    for (const entry of credits) {
      const data = readFileSync(`public/${entry.path}`);
      if (entry.path.endsWith('.jpg')) expect([...data.subarray(0, 2)]).toEqual([255, 216]);
      else expect([...data.subarray(0, 4)]).toEqual([137, 80, 78, 71]);
    }
  });
});
