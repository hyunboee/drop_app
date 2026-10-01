import { PRM_01_OPEN_RADIUS_M, PRM_03_ACCURACY_CAP_M, PRM_03_REMEASURE_ACCURACY_M } from '../params.js';

export const EARTH_RADIUS_M = 6371000;

const toRad = (deg) => (deg * Math.PI) / 180;
const toDeg = (rad) => (rad * 180) / Math.PI;

// 하버사인
export function distanceM(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

// ponytail: 극지방·날짜변경선 미처리
export function boundingBox(center, radiusM) {
  const dLat = toDeg(radiusM / EARTH_RADIUS_M);
  const dLng = dLat / Math.cos(toRad(center.lat));
  return {
    minLat: center.lat - dLat,
    maxLat: center.lat + dLat,
    minLng: center.lng - dLng,
    maxLng: center.lng + dLng,
  };
}

export function isLowAccuracy(accuracy) {
  return accuracy > PRM_03_REMEASURE_ACCURACY_M;
}

export function judgeOpen(d, accuracy) {
  const c = d - Math.min(accuracy, PRM_03_ACCURACY_CAP_M);
  return { allowed: c <= PRM_01_OPEN_RADIUS_M, remainingM: Math.max(0, c - PRM_01_OPEN_RADIUS_M) };
}
