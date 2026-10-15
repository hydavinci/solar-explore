import type { BodyId } from '../simulation/types';
import type { TextureRequest } from './texture-cache';

export const textureManifest = {
  sun: { file: '2k_sun.jpg', label: '太阳' },
  mercury: { file: '2k_mercury.jpg', label: '水星' },
  venus: { file: '2k_venus_atmosphere.jpg', label: '金星' },
  earth: { file: '2k_earth_daymap.jpg', label: '地球表面' },
  earthNight: { file: '2k_earth_nightmap.jpg', label: '地球夜景' },
  earthClouds: { file: '2k_earth_clouds.jpg', label: '地球云层' },
  moon: { file: '2k_moon.jpg', label: '月球' },
  mars: { file: '2k_mars.jpg', label: '火星' },
  jupiter: { file: '2k_jupiter.jpg', label: '木星' },
  saturn: { file: '2k_saturn.jpg', label: '土星' },
  saturnRing: { file: '2k_saturn_ring_alpha.png', label: '土星环' },
  uranus: { file: '2k_uranus.jpg', label: '天王星' },
  neptune: { file: '2k_neptune.jpg', label: '海王星' },
  stars: { file: '2k_stars_milky_way.jpg', label: '银河背景' },
} as const;
export type TextureId = keyof typeof textureManifest;
export type TextureTier = 'base' | 'high';
export const BODY_TEXTURES: Record<BodyId, readonly TextureId[]> = {
  sun: ['sun'], mercury: ['mercury'], venus: ['venus'], earth: ['earth', 'earthNight', 'earthClouds'],
  moon: ['moon'], mars: ['mars'], jupiter: ['jupiter'], saturn: ['saturn', 'saturnRing'],
  uranus: ['uranus'], neptune: ['neptune'],
};
export function assetRequest(id: TextureId, tier: TextureTier, baseUrl = import.meta.env.BASE_URL): TextureRequest {
  const width = tier === 'base' ? 512 : 2048;
  const height = id === 'saturnRing' ? (tier === 'base' ? 31 : 125) : width / 2;
  return {
    key: `${id}:${tier}`, label: textureManifest[id].label,
    url: `${baseUrl.replace(/\/?$/, '/') }assets/${tier === 'base' ? 'base' : 'textures'}/${textureManifest[id].file}`,
    estimatedBytes: Math.ceil(width * height * 4 * 4 / 3),
  };
}
