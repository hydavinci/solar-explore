import type { BodyId } from '../simulation/types';

export const bodyInfo: Record<BodyId, { category: string; description: string; color: string; dayMap: string }> = {
  sun: { category: 'G 型主序星', description: '太阳系的中心恒星。核聚变产生的能量，照亮了我们探索的每一个世界。', color: '#f4b75b', dayMap: 'sun' },
  mercury: { category: '类地行星', description: '最靠近太阳的行星。古老的撞击坑覆盖着它几乎没有大气的表面。', color: '#b9aba0', dayMap: 'mercury' },
  venus: { category: '类地行星', description: '厚重的云层包裹着这个世界。它缓慢地逆向自转，与大多数行星不同。', color: '#deb983', dayMap: 'venus_atmosphere' },
  earth: { category: '类地行星 · 我们的家园', description: '蓝色海洋、流动的云层与薄薄的大气。迄今我们唯一已知孕育生命的世界。', color: '#6ea6de', dayMap: 'earth_daymap' },
  moon: { category: '地球的天然卫星', description: '它以近乎相同的一面朝向地球。月海与高地保存着漫长的撞击历史。', color: '#c2c4c6', dayMap: 'moon' },
  mars: { category: '类地行星', description: '铁锈色的荒漠世界。巨大的火山与干涸河谷，留下了它过去的线索。', color: '#d48662', dayMap: 'mars' },
  jupiter: { category: '气态巨行星', description: '太阳系中最大的行星。明暗相间的云带和巨大风暴，不断重塑它的面貌。', color: '#c8ab89', dayMap: 'jupiter' },
  saturn: { category: '气态巨行星', description: '无数冰粒与岩屑构成壮观的光环。环看似完整，却由独立绕行的微小物体组成。', color: '#d5bd88', dayMap: 'saturn' },
  uranus: { category: '冰巨行星', description: '一颗几乎侧躺着自转的行星。大气中的甲烷赋予它淡青色的外观。', color: '#94d0d1', dayMap: 'uranus' },
  neptune: { category: '冰巨行星', description: '遥远而寒冷的蓝色世界。在这里，阳光抵达之前已穿行数十亿千米。', color: '#5889d5', dayMap: 'neptune' },
};
