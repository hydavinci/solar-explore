import { describe, expect, it } from 'vitest';
import { Texture } from 'three';
import { TextureCache } from './texture-cache';
import { SceneTextures } from './scene-textures';

describe('progressive scene texture selection', () => {
  it('shows base maps before upgrades and keeps low quality strictly base-only', async () => {
    const requests: string[] = [];
    const cache = new TextureCache<Texture>({ load: async request => { requests.push(request.key); return new Texture(); } });
    const maps = new SceneTextures(cache, 'standard');
    maps.setFocus('earth');
    for (let i = 0; i < 60; i++) await Promise.resolve();
    maps.reconcile();
    for (let i = 0; i < 30; i++) await Promise.resolve();
    expect(requests.indexOf('earth:base')).toBeLessThan(requests.indexOf('earth:high'));
    expect(maps.get('earth')).not.toBeNull();
    maps.dispose(); cache.dispose();
    const lowRequests: string[] = [];
    const lowCache = new TextureCache<Texture>({ load: async r => { lowRequests.push(r.key); return new Texture(); } });
    const low = new SceneTextures(lowCache, 'low');
    low.setFocus('saturn');
    for (let i = 0; i < 60; i++) await Promise.resolve();
    low.reconcile();
    expect(lowRequests.every(key => key.endsWith(':base'))).toBe(true);
    low.dispose(); lowCache.dispose();
  });
});
