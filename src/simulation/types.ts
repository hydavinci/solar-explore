export type Vec3 = readonly [number, number, number];
export const BODY_IDS = ['sun', 'mercury', 'venus', 'earth', 'moon', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'] as const;
export type BodyId = typeof BODY_IDS[number];
export type ScaleMode = 'real' | 'schematic';
export interface BodyDefinition {
  readonly id: BodyId;
  readonly parentId: BodyId | null;
  readonly nameZh: string;
  readonly nameEn: string;
  readonly radiusKm: number;
  readonly massKg: number;
  readonly rotationPeriodDays: number;
  readonly axialTiltRad: number;
  readonly rotationEpochJd: number;
  readonly rotationPhaseRad: number;
  /** IAU north pole in J2000 ecliptic coordinates, used with signed spin. */
  readonly northPole?: Vec3;
  readonly source?: string;
}
export interface BodyState {
  readonly id: BodyId;
  readonly positionKm: Vec3;
  readonly spinRad: number;
}
export interface WorldSnapshot {
  readonly julianDay: number;
  readonly bodies: Readonly<Record<BodyId, BodyState>>;
}
export type Catalog = Readonly<Record<BodyId, BodyDefinition>>;
export type WorldEvaluator = (julianDay: number) => WorldSnapshot;
export function isBodyId(id: unknown): id is BodyId {
  return typeof id === 'string' && (BODY_IDS as readonly string[]).includes(id);
}
