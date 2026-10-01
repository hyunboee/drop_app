import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createTestPool, setupTestDb, resetDb, insertUser, insertSession, insertCapsule } from '../helpers/db.js';
import { startApp, request } from '../helpers/app.js';
import { EARTH_RADIUS_M, distanceM, judgeOpen } from '../../src/lib/geo.js';
import { hashIp } from '../../src/services/capsules.js';
import { PRM_03_REMEASURE_ACCURACY_M } from '../../src/params.js';

const SECRET = 'open-test-secret';
let pool;

before(async () => {
  pool = createTestPool();
  await setupTestDb(pool);
});

beforeEach(async () => {
  await resetDb(pool);
});

after(async () => {
  await pool.end();
});

async function start(t, opts = {}) {
  const app = await startApp({ pool, ipHashSecret: SECRET, ...opts });
  t.after(() => app.close());
  return app;
}

async function loggedIn() {
  const user = await insertUser(pool);
  const { cookie } = await insertSession(pool, user.id);
  return { ...user, cookie };
}

const assertError = (res, status, code) => {
  assert.equal(res.status, status);
  assert.equal(res.body.error.code, code);
};

const views = async () => (await pool.query('SELECT * FROM view_records ORDER BY viewed_at, id')).rows;
const north = (p, m) => ({ lat: p.lat + ((m / EARTH_RADIUS_M) * 180) / Math.PI, lng: p.lng });
const open = (url, cookie, id, body, headers) =>
  request(url, `/api/capsules/${id}/open`, { method: 'POST', cookie, body, headers });

// 소유자가 아닌 뷰어와 남의 캡슐
async function setup() {
  const owner = await insertUser(pool);
  const cap = await insertCapsule(pool, { userId: owner.id });
  const viewer = await loggedIn();
  return { owner, cap, viewer };
}

// ---------- 판정 순서 ----------

test('BE-09 FR-10 판정 순서: 비로그인 + 잘못된 id는 401', async (t) => {
  const { url } = await start(t);
  assertError(await open(url, undefined, 'abc', { lat: 91, lng: 0, accuracy: -1 }), 401, 'AUTH_REQUIRED');
});

test('BE-09 FR-10 판정 순서: :id 형식 오류는 400 (accuracy가 나빠도)', async (t) => {
  const { url } = await start(t);
  const { viewer, cap } = await setup();
  assertError(await open(url, viewer.cookie, 'abc', { lat: cap.lat, lng: cap.lng, accuracy: 50 }), 400, 'VALIDATION_FAILED');
});

test('BE-09 FR-10 판정 순서: 없는 캡슐 + 나쁜 accuracy는 404 CAPSULE_NOT_FOUND', async (t) => {
  const { url } = await start(t);
  const viewer = await loggedIn();
  const res = await open(url, viewer.cookie, randomUUID(), { lat: 37.5665, lng: 126.978, accuracy: 50 });
  assertError(res, 404, 'CAPSULE_NOT_FOUND');
});

test('BE-09 BR-11 만료·DELETED 캡슐은 반경 안이어도 404, 행 없음', async (t) => {
  const { url } = await start(t);
  const owner = await insertUser(pool);
  const viewer = await loggedIn();
  const expired = await insertCapsule(pool, { userId: owner.id, expiresAt: new Date(Date.now() - 1000) });
  const deleted = await insertCapsule(pool, { userId: owner.id, status: 'DELETED' });
  for (const cap of [expired, deleted]) {
    assertError(await open(url, viewer.cookie, cap.id, { lat: cap.lat, lng: cap.lng, accuracy: 5 }), 404, 'CAPSULE_NOT_FOUND');
  }
  assert.equal((await views()).length, 0);
});

test('BE-09 FR-10 판정 순서: 반경 밖 + 나쁜 accuracy는 422 LOW_ACCURACY, 행 없음', async (t) => {
  const { url } = await start(t);
  const { viewer, cap } = await setup();
  const res = await open(url, viewer.cookie, cap.id, { ...north(cap, 100), accuracy: PRM_03_REMEASURE_ACCURACY_M + 0.01 });
  assertError(res, 422, 'LOW_ACCURACY');
  assert.equal((await views()).length, 0);
});

test('BE-09 본문 위경도·accuracy 형식·범위 오류는 400 VALIDATION_FAILED', async (t) => {
  const { url } = await start(t);
  const { viewer, cap } = await setup();
  const ok = { lat: cap.lat, lng: cap.lng, accuracy: 5 };
  for (const over of [
    { lat: 91 },
    { lat: -91 },
    { lat: '37.5' },
    { lat: undefined },
    { lng: 181 },
    { lng: -181 },
    { lng: null },
    { accuracy: -1 },
    { accuracy: '5' },
    { accuracy: undefined },
  ]) {
    assertError(await open(url, viewer.cookie, cap.id, { ...ok, ...over }), 400, 'VALIDATION_FAILED');
  }
  assertError(await open(url, viewer.cookie, cap.id), 400, 'VALIDATION_FAILED');
  assert.equal((await views()).length, 0);
});

// ---------- 거리 판정 ----------

test('BE-09 J-02 경계 안(9.999m, accuracy 0) 200 { media_url }, view_records 1행', async (t) => {
  const { url } = await start(t);
  const { viewer, cap } = await setup();
  const pos = north(cap, 9.999);
  const res = await open(url, viewer.cookie, cap.id, { ...pos, accuracy: 0 });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { media_url: `/api/media/${cap.media_id}` });

  const rows = await views();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].capsule_id, cap.id);
  assert.equal(rows[0].user_id, viewer.id);
  assert.deepEqual([rows[0].lat, rows[0].lng, rows[0].accuracy], [pos.lat, pos.lng, 0]);
});

test('BE-09 J-03 경계 밖(10.5m, accuracy 0) 403 OUT_OF_RANGE, remaining_m = judgeOpen 남은 거리, 행 없음', async (t) => {
  const { url } = await start(t);
  const { viewer, cap } = await setup();
  const pos = north(cap, 10.5);
  const res = await open(url, viewer.cookie, cap.id, { ...pos, accuracy: 0 });
  assertError(res, 403, 'OUT_OF_RANGE');
  const expected = judgeOpen(distanceM(pos, cap), 0).remainingM;
  assert.equal(typeof res.body.error.remaining_m, 'number');
  assert.ok(Math.abs(res.body.error.remaining_m - expected) < 1e-9, `${res.body.error.remaining_m} vs ${expected}`);
  assert.ok(Math.abs(expected - 0.5) < 0.01);
  assert.equal((await views()).length, 0);
});

test('BE-09 PRM-03 accuracy 보정: 30m 떨어져도 accuracy 20(재측정 기준 이하)이면 200', async (t) => {
  const { url } = await start(t);
  const { viewer, cap } = await setup();
  const res = await open(url, viewer.cookie, cap.id, { ...north(cap, 29.99), accuracy: 20 });
  assert.equal(res.status, 200);
});

test('BE-09 소유자도 같은 판정을 거친다(반경 밖 403, 반경 안 200)', async (t) => {
  const { url } = await start(t);
  const owner = await loggedIn();
  const cap = await insertCapsule(pool, { userId: owner.id });
  assertError(await open(url, owner.cookie, cap.id, { ...north(cap, 50), accuracy: 0 }), 403, 'OUT_OF_RANGE');
  assert.equal((await open(url, owner.cookie, cap.id, { lat: cap.lat, lng: cap.lng, accuracy: 0 })).status, 200);
  assert.equal((await views()).length, 1);
});

// ---------- 열람 기록·IP 해시 ----------

test('BE-09 PRV-04 ip_hash는 IP 원문이 아니고 같은 IP는 같은 해시, 다른 IP는 다른 해시', async (t) => {
  const { url } = await start(t);
  const { viewer, cap } = await setup();
  const body = { lat: cap.lat, lng: cap.lng, accuracy: 5 };
  const ip = '203.0.113.5';
  for (const xff of [ip, ip, '198.51.100.7']) {
    assert.equal((await open(url, viewer.cookie, cap.id, body, { 'X-Forwarded-For': xff })).status, 200);
  }
  const [a, b, c] = (await views()).map((r) => r.ip_hash);
  assert.notEqual(a, ip);
  assert.ok(!a.includes(ip));
  assert.equal(a, b);
  assert.equal(a, hashIp(SECRET, ip));
  assert.notEqual(c, a);
  assert.equal(c, hashIp(SECRET, '198.51.100.7'));
});

test('BE-09 R-1 trust proxy 1: X-Forwarded-For의 가장 오른쪽 값을 클라이언트 IP로 쓴다', async (t) => {
  const { url } = await start(t);
  const { viewer, cap } = await setup();
  const res = await open(url, viewer.cookie, cap.id, { lat: cap.lat, lng: cap.lng, accuracy: 5 }, {
    'X-Forwarded-For': '1.2.3.4, 203.0.113.5',
  });
  assert.equal(res.status, 200);
  assert.equal((await views())[0].ip_hash, hashIp(SECRET, '203.0.113.5'));
});

test('BE-09 ERD 1.4 같은 뷰어가 두 번 열면 view_records 두 행', async (t) => {
  const { url } = await start(t);
  const { viewer, cap } = await setup();
  const body = { lat: cap.lat, lng: cap.lng, accuracy: 5 };
  assert.equal((await open(url, viewer.cookie, cap.id, body)).status, 200);
  assert.equal((await open(url, viewer.cookie, cap.id, body)).status, 200);
  const rows = await views();
  assert.equal(rows.length, 2);
  assert.ok(rows.every((r) => r.capsule_id === cap.id && r.user_id === viewer.id));
});

test('BE-09 403·404·422 응답에서는 view_records 행이 생기지 않는다', async (t) => {
  const { url } = await start(t);
  const { viewer, cap } = await setup();
  assertError(await open(url, viewer.cookie, cap.id, { ...north(cap, 10.5), accuracy: 0 }), 403, 'OUT_OF_RANGE');
  assertError(await open(url, viewer.cookie, randomUUID(), { lat: cap.lat, lng: cap.lng, accuracy: 0 }), 404, 'CAPSULE_NOT_FOUND');
  assertError(await open(url, viewer.cookie, cap.id, { lat: cap.lat, lng: cap.lng, accuracy: 50 }), 422, 'LOW_ACCURACY');
  assert.equal((await views()).length, 0);
});
