import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { EARTH_RADIUS_M, distanceM, boundingBox, isLowAccuracy, judgeOpen } from '../../src/lib/geo.js';
import { M_01_NEARBY_RADIUS_M } from '../../src/params.js';

const near = (actual, expected, tol = 0.01) =>
  assert.ok(Math.abs(actual - expected) <= tol, `${actual} != ${expected} (±${tol})`);

const ORIGIN = { lat: 37.5665, lng: 126.978 };
// 남북 m미터 오프셋 (6.2 규칙)
const northOf = (p, m) => ({ lat: p.lat + (m / EARTH_RADIUS_M) * (180 / Math.PI), lng: p.lng });

const inBox = (box, p) => box.minLat <= p.lat && p.lat <= box.maxLat && box.minLng <= p.lng && p.lng <= box.maxLng;

test('BE-07 지구 반지름은 6,371,000m', () => {
  assert.equal(EARTH_RADIUS_M, 6371000);
});

// ---------- 공통 테스트 표 ----------

test('BE-07 G-01 distanceM 같은 점은 0', () => {
  assert.equal(distanceM(ORIGIN, { lat: 37.5665, lng: 126.978 }), 0);
});

test('BE-07 G-02 distanceM 위도 0.0001 차이는 11.12m (±0.01)', () => {
  near(distanceM(ORIGIN, { lat: 37.5666, lng: 126.978 }), 11.12);
});

test('BE-07 G-03 distanceM 위도 0.0002 차이는 22.24m (±0.01)', () => {
  near(distanceM(ORIGIN, { lat: 37.5667, lng: 126.978 }), 22.24);
});

test('BE-07 G-04 distanceM 위도 0.0004 차이는 44.48m (±0.01)', () => {
  near(distanceM(ORIGIN, { lat: 37.5669, lng: 126.978 }), 44.48);
});

test('BE-07 J-01 judgeOpen d=0, accuracy=5 허용, remaining 0', () => {
  assert.deepEqual(judgeOpen(0, 5), { allowed: true, remainingM: 0 });
});

test('BE-07 J-02 judgeOpen d=10, accuracy=0 허용(경계 같음), remaining 0', () => {
  assert.deepEqual(judgeOpen(10, 0), { allowed: true, remainingM: 0 });
});

test('BE-07 J-03 judgeOpen d=10.5, accuracy=0 거부, remaining 0.5', () => {
  const r = judgeOpen(10.5, 0);
  assert.equal(r.allowed, false);
  near(r.remainingM, 0.5, 1e-9);
});

test('BE-07 J-04 judgeOpen d=30, accuracy=20 허용(경계), remaining 0', () => {
  assert.deepEqual(judgeOpen(30, 20), { allowed: true, remainingM: 0 });
});

test('BE-07 J-05 judgeOpen d=30, accuracy=25 허용(보정 상한 20 적용), remaining 0', () => {
  assert.deepEqual(judgeOpen(30, 25), { allowed: true, remainingM: 0 });
});

test('BE-07 J-06 judgeOpen d=40, accuracy=25 거부, remaining 10', () => {
  const r = judgeOpen(40, 25);
  assert.equal(r.allowed, false);
  near(r.remainingM, 10, 1e-9);
});

test('BE-07 J-07 judgeOpen d=22.24, accuracy=5 거부, remaining 7.24 (±0.01)', () => {
  const r = judgeOpen(22.24, 5);
  assert.equal(r.allowed, false);
  near(r.remainingM, 7.24);
});

test('BE-07 A-01 isLowAccuracy accuracy=30은 false (판정함)', () => {
  assert.equal(isLowAccuracy(30), false);
});

test('BE-07 A-02 isLowAccuracy accuracy=30.01은 true (재측정 안내)', () => {
  assert.equal(isLowAccuracy(30.01), true);
});

// ---------- boundingBox ----------

test('BE-07 boundingBox(M-01): 중심에서 남북 189m 지점은 박스 안', () => {
  const box = boundingBox(ORIGIN, M_01_NEARBY_RADIUS_M);
  assert.ok(inBox(box, ORIGIN));
  assert.ok(inBox(box, northOf(ORIGIN, 189)));
  assert.ok(inBox(box, northOf(ORIGIN, -189)));
});

test('BE-07 boundingBox(M-01): 중심에서 남북 212m 지점은 박스 밖', () => {
  const box = boundingBox(ORIGIN, M_01_NEARBY_RADIUS_M);
  assert.ok(!inBox(box, northOf(ORIGIN, 212)));
  assert.ok(!inBox(box, northOf(ORIGIN, -212)));
});

test('BE-07 boundingBox 경도 폭은 위도 보정(cos)으로 위도 폭보다 넓다', () => {
  const box = boundingBox(ORIGIN, M_01_NEARBY_RADIUS_M);
  const dLat = box.maxLat - ORIGIN.lat;
  const dLng = box.maxLng - ORIGIN.lng;
  near(ORIGIN.lat - box.minLat, dLat, 1e-12);
  near(ORIGIN.lng - box.minLng, dLng, 1e-12);
  near(dLng, dLat / Math.cos((ORIGIN.lat * Math.PI) / 180), 1e-12);
});

test('BE-07 src/lib/geo.js는 ../params.js 외 다른 모듈을 import하지 않는다', async () => {
  const src = await readFile(new URL('../../src/lib/geo.js', import.meta.url), 'utf8');
  const imports = [...src.matchAll(/\bfrom\s+['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1] ?? m[2]);
  assert.deepEqual([...new Set(imports)], ['../params.js']);
});
