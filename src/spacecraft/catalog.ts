import type { BodyId } from '../simulation/types';

export const SPACECRAFT_IDS = [
  'voyager-1', 'voyager-2', 'cassini', 'juno', 'new-horizons', 'tianwen-1',
] as const;
export type SpacecraftId = typeof SPACECRAFT_IDS[number];
export type SpacecraftModelKind = 'voyager' | 'cassini' | 'juno' | 'new-horizons' | 'tianwen-orbiter';
export interface SpacecraftDefinition {
  readonly id: SpacecraftId;
  readonly nameZh: string;
  readonly nameEn: string;
  readonly agency: string;
  readonly launchDate: string;
  readonly summary: string;
  readonly relatedBodyIds: readonly BodyId[];
  readonly events: readonly { readonly dateLabel: string; readonly text: string }[];
  readonly sources: readonly { readonly label: string; readonly url: string }[];
  readonly verifiedAt: string;
  readonly model: SpacecraftModelKind;
  readonly trajectory:
    | { readonly kind: 'missing'; readonly reason: string }
    | { readonly kind: 'published'; readonly datasetId: 'voyager-1-jupiter-1979' };
}

export function isSpacecraftId(value: unknown): value is SpacecraftId {
  return typeof value === 'string' && SPACECRAFT_IDS.some(id => id === value);
}

const missingTrajectory = {
  kind: 'missing',
  reason: '尚未接入经过核验的真实轨迹数据；当前仅提供资料和模型预览。',
} as const;
const verifiedAt = '2026-10-15';

export const spacecraftCatalog: Readonly<Record<SpacecraftId, SpacecraftDefinition>> = {
  'voyager-1': {
    id: 'voyager-1', nameZh: '旅行者1号', nameEn: 'Voyager 1', agency: 'NASA / JPL',
    launchDate: '1977-09-05', model: 'voyager', verifiedAt,
    trajectory: { kind: 'published', datasetId: 'voyager-1-jupiter-1979' },
    summary: '探访木星和土星后，继续向日球层外探测，成为首个进入星际空间的人造探测器。',
    relatedBodyIds: ['jupiter', 'saturn'],
    events: [
      { dateLabel: '1979-03-05', text: '飞掠木星，近距离观测木星及其卫星。' },
      { dateLabel: '1980-11-12', text: '飞掠土星，探测光环与卫星系统。' },
      { dateLabel: '2012年8月', text: '越过日球层边界，进入星际空间。' },
    ],
    sources: [{ label: 'NASA：Voyager 1', url: 'https://science.nasa.gov/mission/voyager/voyager-1/' }],
  },
  'voyager-2': {
    id: 'voyager-2', nameZh: '旅行者2号', nameEn: 'Voyager 2', agency: 'NASA / JPL',
    launchDate: '1977-08-20', model: 'voyager', verifiedAt, trajectory: missingTrajectory,
    summary: '依次近距离探测木星、土星、天王星和海王星，完成对四颗巨行星的巡访。',
    relatedBodyIds: ['jupiter', 'saturn', 'uranus', 'neptune'],
    events: [
      { dateLabel: '1979-07-09', text: '飞掠木星。' },
      { dateLabel: '1986-01-24', text: '飞掠天王星，观测其光环与卫星。' },
      { dateLabel: '1989-08-25', text: '飞掠海王星，完成巨行星探访。' },
    ],
    sources: [{ label: 'NASA：Voyager 2', url: 'https://science.nasa.gov/mission/voyager/voyager-2/' }],
  },
  cassini: {
    id: 'cassini', nameZh: '卡西尼号', nameEn: 'Cassini', agency: 'NASA / ESA / ASI',
    launchDate: '1997-10-15', model: 'cassini', verifiedAt, trajectory: missingTrajectory,
    summary: '长期环绕土星，研究大气、光环和卫星系统，并将惠更斯探测器送往土卫六。',
    relatedBodyIds: ['saturn'],
    events: [
      { dateLabel: '2004年', text: '进入土星轨道，开始环绕探测。' },
      { dateLabel: '2017-09-15', text: '进入土星大气，结束任务。' },
    ],
    sources: [
      { label: 'NASA：Cassini 任务', url: 'https://science.nasa.gov/mission/cassini/about-the-mission/' },
      { label: 'NASA：任务时间线', url: 'https://science.nasa.gov/mission/cassini/the-journey/timeline/' },
    ],
  },
  juno: {
    id: 'juno', nameZh: '朱诺号', nameEn: 'Juno', agency: 'NASA / JPL',
    launchDate: '2011-08-05', model: 'juno', verifiedAt, trajectory: missingTrajectory,
    summary: '以木星为探测目标，研究它的大气、内部结构和磁场，为理解巨行星的形成提供线索。',
    relatedBodyIds: ['jupiter'],
    events: [
      { dateLabel: '2011-08-05', text: '发射，启程前往木星。' },
      { dateLabel: '2016年', text: '进入木星轨道。' },
    ],
    sources: [
      { label: 'NASA：Juno', url: 'https://science.nasa.gov/mission/juno/' },
      { label: 'NASA：发射回顾', url: 'https://www.nasa.gov/image-article/this-week-nasa-history-juno-launches-aug-5-2011/' },
    ],
  },
  'new-horizons': {
    id: 'new-horizons', nameZh: '新视野号', nameEn: 'New Horizons', agency: 'NASA / 约翰斯·霍普金斯大学 APL',
    launchDate: '2006-01-19', model: 'new-horizons', verifiedAt, trajectory: missingTrajectory,
    summary: '探索冥王星及柯伊伯带天体；通过木星引力助推继续向太阳系外缘航行。',
    relatedBodyIds: ['jupiter'],
    events: [
      { dateLabel: '2007-02-28', text: '飞掠木星并进行引力助推。' },
      { dateLabel: '2015-07-14', text: '飞掠冥王星及其卫星系统。' },
      { dateLabel: '2019-01-01', text: '飞掠柯伊伯带天体 Arrokoth。' },
    ],
    sources: [{ label: 'NASA：New Horizons', url: 'https://science.nasa.gov/mission/new-horizons/' }],
  },
  'tianwen-1': {
    id: 'tianwen-1', nameZh: '天问一号', nameEn: 'Tianwen-1', agency: '国家航天局（CNSA）',
    launchDate: '2020-07-23', model: 'tianwen-orbiter', verifiedAt, trajectory: missingTrajectory,
    summary: '我国首次火星探测任务，包含环绕探测与着陆巡视。本模型表示环绕器，不是祝融号火星车。',
    relatedBodyIds: ['mars'],
    events: [
      { dateLabel: '2020-07-23', text: '从海南文昌发射，前往火星。' },
      { dateLabel: '2021-02-10', text: '实施火星捕获，进入环火轨道。' },
    ],
    sources: [
      { label: '国家航天局：任务介绍', url: 'https://www.cnsa.gov.cn/n6758824/n6759009/n6760412/c6840460/content.html' },
      { label: '国家航天局：发射通报', url: 'https://www.cnsa.gov.cn/n6759533/c6809878/content.html' },
    ],
  },
};
