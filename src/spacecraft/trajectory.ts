import type { Vec3 } from '../simulation/types';
import manifest from './voyager1-manifest.json';

export { default as trajectoryManifest } from './voyager1-manifest.json';
export type StateSample = readonly [number, number, number, number, number, number, number, number, number, number, number, number, number];
export interface TrajectorySegment {
  readonly source: string;
  readonly startUtcMs: number;
  readonly endUtcMs: number;
  readonly samples: readonly StateSample[];
}
export interface TrajectoryData {
  readonly schemaVersion: 1;
  readonly id: 'voyager-1-jupiter-1979';
  readonly spacecraftId: 'voyager-1';
  readonly center: 'SUN';
  readonly frame: 'ECLIPJ2000';
  readonly timeScale: 'UTC';
  readonly positionUnit: 'km';
  readonly velocityUnit: 'km/s';
  readonly segments: readonly TrajectorySegment[];
}
export interface StateVector {
  readonly positionKm: Vec3;
  readonly velocityKmPerSecond: Vec3;
}
export interface TrajectorySample {
  readonly utcMs: number;
  readonly segmentIndex: number;
  readonly spacecraft: StateVector;
  readonly jupiter: StateVector;
}
export type TrajectoryResource =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly data: TrajectoryData }
  | { readonly kind: 'error'; readonly message: string };

function invalid(reason: string): never { throw new Error(`轨迹数据无效：${reason}`); }
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function finite(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : invalid('时间或坐标不是有限数值');
}
function stateRow(value: unknown): StateSample {
  if (!Array.isArray(value) || value.length !== 13) invalid('状态行必须包含时间及十二个分量');
  return [
    finite(value[0]), finite(value[1]), finite(value[2]), finite(value[3]),
    finite(value[4]), finite(value[5]), finite(value[6]), finite(value[7]),
    finite(value[8]), finite(value[9]), finite(value[10]), finite(value[11]), finite(value[12]),
  ];
}
export function decodeTrajectory(input: unknown): TrajectoryData {
  if (!isRecord(input) || input.schemaVersion !== 1 || input.id !== 'voyager-1-jupiter-1979'
    || input.spacecraftId !== 'voyager-1' || input.center !== 'SUN' || input.frame !== 'ECLIPJ2000'
    || input.timeScale !== 'UTC' || input.positionUnit !== 'km' || input.velocityUnit !== 'km/s') {
    invalid('版本、对象、参考系、时间尺度或单位不匹配');
  }
  if (!Array.isArray(input.segments) || input.segments.length === 0) invalid('没有有效连续数据段');
  let previousEnd = -Infinity;
  const segments = input.segments.map((value: unknown): TrajectorySegment => {
    if (!isRecord(value) || typeof value.source !== 'string' || !value.source.trim()
      || !Array.isArray(value.samples) || value.samples.length < 2) invalid('数据段缺少来源或样本');
    const startUtcMs = finite(value.startUtcMs), endUtcMs = finite(value.endUtcMs);
    if (endUtcMs <= startUtcMs || startUtcMs <= previousEnd) invalid('数据段倒序或重叠');
    const samples = value.samples.map(stateRow);
    if (samples[0]![0] !== startUtcMs || samples.at(-1)![0] !== endUtcMs) invalid('覆盖边界与实际样本不符');
    for (let i = 1; i < samples.length; i++) {
      if (samples[i]![0] <= samples[i - 1]![0]) invalid('样本时间必须严格递增');
    }
    previousEnd = endUtcMs;
    return { source: value.source, startUtcMs, endUtcMs, samples };
  });
  return {
    schemaVersion: 1, id: 'voyager-1-jupiter-1979', spacecraftId: 'voyager-1',
    center: 'SUN', frame: 'ECLIPJ2000', timeScale: 'UTC',
    positionUnit: 'km', velocityUnit: 'km/s', segments,
  };
}
export async function loadTrajectory(signal: AbortSignal, fetcher: typeof fetch = fetch, baseUrl = import.meta.env.BASE_URL): Promise<TrajectoryData> {
  const url = `${baseUrl.replace(/\/?$/, '/')}${manifest.url.replace(/^\//, '')}`;
  const response = await fetcher(url, { signal });
  if (!response.ok) throw new Error(`轨迹资源读取失败（HTTP ${response.status}）`);
  const bytes = await response.arrayBuffer();
  signal.throwIfAborted();
  if (!globalThis.crypto?.subtle) throw new Error('无法校验轨迹摘要；请使用 HTTPS 或 localhost');
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hash = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
  if (hash !== manifest.sha256) throw new Error('轨迹资源 SHA-256 校验失败，请重新加载');
  const decoded: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  const data = decodeTrajectory(decoded);
  if (data.segments.length !== manifest.coverage.length || data.segments.some((s, i) =>
    s.startUtcMs !== manifest.coverage[i]![0] || s.endUtcMs !== manifest.coverage[i]![1])) invalid('覆盖范围与资产描述不符');
  signal.throwIfAborted();
  return data;
}
export function utcMilliseconds(julianDay: number): number {
  return finite((finite(julianDay) - 2440587.5) * 86400000);
}
function vector(row: StateSample, offset: 1 | 7): StateVector {
  return {
    positionKm: [row[offset]!, row[offset + 1]!, row[offset + 2]!],
    velocityKmPerSecond: [row[offset + 3]!, row[offset + 4]!, row[offset + 5]!],
  };
}
function interpolate(a: StateSample, b: StateSample, ms: number, offset: 1 | 7): StateVector {
  const t = (ms - a[0]) / (b[0] - a[0]), seconds = (b[0] - a[0]) / 1000;
  const t2 = t*t, t3 = t2*t;
  const position = (i: number): number =>
    a[i]! + (3*t2 - 2*t3)*(b[i]! - a[i]!) + seconds*((t3 - 2*t2 + t)*a[i + 3]! + (t3 - t2)*b[i + 3]!);
  const velocity = (i: number): number =>
    (6*t - 6*t2)*(b[i]! - a[i]!)/seconds + (3*t2 - 4*t + 1)*a[i + 3]! + (3*t2 - 2*t)*b[i + 3]!;
  return {
    positionKm: [position(offset), position(offset + 1), position(offset + 2)],
    velocityKmPerSecond: [velocity(offset), velocity(offset + 1), velocity(offset + 2)],
  };
}
export function sampleTrajectory(data: TrajectoryData, utcMs: number): TrajectorySample | null {
  finite(utcMs);
  let low = 0, high = data.segments.length - 1;
  while (low <= high) {
    const middle = (low + high) >>> 1, segment = data.segments[middle]!;
    if (utcMs < segment.startUtcMs) { high = middle - 1; continue; }
    if (utcMs > segment.endUtcMs) { low = middle + 1; continue; }
    let a = 0, b = segment.samples.length - 1;
    while (b - a > 1) {
      const index = (a + b) >>> 1;
      if (segment.samples[index]![0] > utcMs) b = index; else a = index;
    }
    const left = segment.samples[a]!, right = segment.samples[b]!;
    const exact = utcMs === left[0] ? left : utcMs === right[0] ? right : null;
    return {
      utcMs, segmentIndex: middle,
      spacecraft: exact ? vector(exact, 1) : interpolate(left, right, utcMs, 1),
      jupiter: exact ? vector(exact, 7) : interpolate(left, right, utcMs, 7),
    };
  }
  return null;
}
