export function formatDistance(km: number): string {
  if (!Number.isFinite(km)) return '—';
  if (Math.abs(km) >= 10_000_000) return `${(km / 149_597_870.7).toFixed(3)} AU`;
  if (Math.abs(km) < 10) return `${km.toFixed(2)} km`;
  return `${Math.round(km).toLocaleString('en-US')} km`;
}

export function formatRate(rate: number): string {
  if (rate === 1) return '实时';
  const prefix = rate < 0 ? '−' : '';
  return `${prefix}${Math.abs(rate).toLocaleString('en-US')}×`;
}
