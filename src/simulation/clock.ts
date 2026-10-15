export interface ClockState {
  readonly julianDay: number;
  readonly rate: number;
  readonly paused: boolean;
  readonly hidden: boolean;
}
export const UNIX_EPOCH_JD = 2440587.5;
export const DAY_MS = 86400000;
export const MIN_JD = Date.UTC(1800, 0, 1) / DAY_MS + UNIX_EPOCH_JD;
export const MAX_JD = Date.UTC(2050, 0, 1) / DAY_MS + UNIX_EPOCH_JD;
export const LAST_JD = (Date.UTC(2050, 0, 1) - 1) / DAY_MS + UNIX_EPOCH_JD;
export const nowJulianDay = (): number => Date.now() / DAY_MS + UNIX_EPOCH_JD;
export function assertValidDate(jd: number): void {
  if (!Number.isFinite(jd) || jd < MIN_JD || jd >= MAX_JD) throw new Error('UTC 日期须在 1800-01-01（含）至 2050-01-01（不含）之间');
}
export function toUtcIso(jd: number): string {
  assertValidDate(jd);
  return new Date(Math.round((jd - UNIX_EPOCH_JD) * DAY_MS)).toISOString();
}
export function parseUtcDate(value: string): { ok: true; julianDay: number } | { ok: false; message: string } {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?Z?)?$/.exec(value);
  if (!match) return { ok: false, message: '请输入有效 UTC 日期，例如 2026-10-13T12:00:00Z' };
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const hour = Number(match[4] ?? 0), minute = Number(match[5] ?? 0), second = Number(match[6] ?? 0);
  const ms = Number((match[7] ?? '').padEnd(3, '0'));
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second, ms));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day || hour > 23 || minute > 59 || second > 59) {
    return { ok: false, message: '无效的 UTC 日历日期' };
  }
  const julianDay = date.getTime() / DAY_MS + UNIX_EPOCH_JD;
  try { assertValidDate(julianDay); } catch (error) { return { ok: false, message: (error as Error).message }; }
  return { ok: true, julianDay };
}
export function advanceClock(state: ClockState, realDeltaSeconds: number): { state: ClockState; boundaryReached: boolean } {
  assertValidDate(state.julianDay);
  if (!Number.isFinite(realDeltaSeconds) || realDeltaSeconds < 0) throw new Error('Frame delta must be finite and non-negative');
  if (!Number.isFinite(state.rate)) throw new Error('Time rate must be finite');
  if (state.hidden || state.paused || state.rate === 0 || realDeltaSeconds === 0) return { state, boundaryReached: false };
  const jd = state.julianDay + realDeltaSeconds * state.rate / 86400;
  const boundaryReached = jd < MIN_JD || jd >= MAX_JD;
  return { state: { ...state, julianDay: Math.max(MIN_JD, Math.min(LAST_JD, jd)), paused: state.paused || boundaryReached }, boundaryReached };
}
