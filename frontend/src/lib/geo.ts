import { PRM_01_OPEN_RADIUS_M, PRM_03_ACCURACY_CAP_M, PRM_03_REMEASURE_ACCURACY_M } from '../params';

export const EARTH_RADIUS_M = 6371000;
export interface LatLng {
  lat: number;
  lng: number;
}

const toRad = (deg: number) => (deg * Math.PI) / 180;

// 하버사인 (백엔드 lib/geo.js와 같은 식)
export function distanceM(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

// 반경 밖이면 같은 방향으로 경계까지 줄인다 (드롭 배치, PRM-20)
export function clampOffset(eastM: number, northM: number, maxM: number): { eastM: number; northM: number } {
  const d = Math.hypot(eastM, northM);
  if (d <= maxM) return { eastM, northM };
  return { eastM: (eastM * maxM) / d, northM: (northM * maxM) / d };
}

// 동·북으로 m만큼 옮긴 좌표 (수십 m 이내에서 쓰는 평면 근사)
export function offsetToLatLng(origin: LatLng, eastM: number, northM: number): LatLng {
  const deg = 180 / Math.PI;
  return {
    lat: origin.lat + (northM / EARTH_RADIUS_M) * deg,
    lng: origin.lng + (eastM / (EARTH_RADIUS_M * Math.cos(toRad(origin.lat)))) * deg,
  };
}

// offsetToLatLng의 역: origin에서 p까지 동·북 m
export function latLngToOffset(origin: LatLng, p: LatLng): { eastM: number; northM: number } {
  const rad = Math.PI / 180;
  return {
    eastM: (p.lng - origin.lng) * rad * EARTH_RADIUS_M * Math.cos(toRad(origin.lat)),
    northM: (p.lat - origin.lat) * rad * EARTH_RADIUS_M,
  };
}

export function isLowAccuracy(accuracy: number): boolean {
  return accuracy > PRM_03_REMEASURE_ACCURACY_M;
}

export function judgeOpen(d: number, accuracy: number): { allowed: boolean; remainingM: number } {
  const c = d - Math.min(accuracy, PRM_03_ACCURACY_CAP_M);
  return { allowed: c <= PRM_01_OPEN_RADIUS_M, remainingM: Math.max(0, c - PRM_01_OPEN_RADIUS_M) };
}

export function formatRemaining(remainingM: number): string {
  return `${Math.ceil(remainingM)}m`;
}

export interface OrientationLike {
  webkitCompassHeading?: number | null;
  alpha?: number | null;
  absolute?: boolean;
}

const normalize = (h: number) => ((h % 360) + 360) % 360;

// iOS는 webkitCompassHeading, Android는 deviceorientationabsolute의 alpha(반시계)를 쓴다
export function toHeading(e: OrientationLike): number | null {
  if (typeof e.webkitCompassHeading === 'number' && Number.isFinite(e.webkitCompassHeading)) {
    return normalize(e.webkitCompassHeading);
  }
  if (e.absolute === true && typeof e.alpha === 'number' && Number.isFinite(e.alpha)) {
    return normalize(360 - e.alpha);
  }
  return null;
}

export interface FrameState {
  openable: boolean;
  remainingM: number;
  remainingLabel: string | null;
}

export function frameState(capsule: LatLng, position: LatLng & { accuracy: number }): FrameState {
  const { remainingM } = judgeOpen(distanceM(position, capsule), position.accuracy);
  const openable = remainingM === 0;
  return { openable, remainingM, remainingLabel: openable ? null : `${formatRemaining(remainingM)} 남음` };
}
