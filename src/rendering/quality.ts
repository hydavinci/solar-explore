export type Quality = 'low' | 'standard';

export function renderSize(width: number, height: number, dpr: number, quality: Quality) {
  if (![width, height, dpr].every(v => Number.isFinite(v) && v > 0)) {
    throw new Error('渲染尺寸必须为正数');
  }
  const budget = quality === 'standard' ? 1920 * 1080 : 1280 * 720;
  const ratio = Math.min(dpr, Math.sqrt(budget / (width * height)));
  return { width: Math.max(1, Math.floor(width * ratio)), height: Math.max(1, Math.floor(height * ratio)) };
}

export function summarizeFrameTimes(samples: readonly number[]) {
  if (!samples.length || samples.some(v => !Number.isFinite(v) || v <= 0)) {
    throw new Error('缺少有效帧时间样本');
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const medianMs = sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
  return { medianMs, p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1]! };
}
