import { SRGBColorSpace, Texture } from 'three';
import type { BodyId } from '../simulation/types';
import type { Quality } from '../rendering/quality';
import { assetRequest, BODY_TEXTURES, type TextureId } from './manifest';
import { TextureCache, type TextureLease, type TextureRequest } from './texture-cache';

export function loadTexture(request: TextureRequest, signal: AbortSignal): Promise<Texture> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const clean = () => { image.onload = null; image.onerror = null; signal.removeEventListener('abort', abort); };
    const abort = () => { clean(); image.src = ''; reject(new Error(`纹理加载已取消：${request.label}`)); };
    image.onload = () => {
      clean();
      const texture = new Texture(image);
      texture.colorSpace = SRGBColorSpace;
      texture.anisotropy = 4;
      texture.needsUpdate = true;
      resolve(texture);
    };
    image.onerror = () => { clean(); reject(new Error(`纹理加载失败：${request.label}（${request.url}）`)); };
    if (signal.aborted) { abort(); return; }
    signal.addEventListener('abort', abort, { once: true });
    image.src = request.url;
  });
}

export class SceneTextures {
  private readonly base = new Map<TextureId, TextureLease<Texture>>();
  private readonly high = new Map<TextureId, TextureLease<Texture>>();
  private focus: BodyId | null = null;
  constructor(readonly cache: TextureCache<Texture>, readonly quality: Quality) {
    const ids = [...BODY_TEXTURES.earth, ...Object.values(BODY_TEXTURES).flat()];
    for (const id of ids) {
      if (quality === 'low' && id === 'earthClouds') continue;
      if (!this.base.has(id)) this.base.set(id, cache.acquire(assetRequest(id, 'base')));
    }
  }
  setFocus(id: BodyId | null) {
    if (id === this.focus) return;
    this.focus = id;
    const desired = id && this.quality === 'standard' ? BODY_TEXTURES[id] : [];
    for (const [key, lease] of this.high) if (!desired.includes(key)) { lease.release(); this.high.delete(key); }
    this.reconcile();
  }
  reconcile() {
    if (this.quality !== 'standard' || !this.focus) return;
    for (const id of BODY_TEXTURES[this.focus]) {
      if (!this.high.has(id) && this.base.get(id)?.getSnapshot().status === 'ready') {
        this.high.set(id, this.cache.acquire(assetRequest(id, 'high')));
      }
    }
  }
  get(id: TextureId): Texture | null {
    return this.high.get(id)?.getSnapshot().resource ?? this.base.get(id)?.getSnapshot().resource ?? null;
  }
  dispose() {
    for (const lease of [...this.base.values(), ...this.high.values()]) lease.release();
    this.base.clear(); this.high.clear();
  }
}
