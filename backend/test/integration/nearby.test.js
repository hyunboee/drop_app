import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestPool, setupTestDb, resetDb, insertUser, insertSession, insertCapsule } from '../helpers/db.js';
import { startApp, request } from '../helpers/app.js';
import { EARTH_RADIUS_M } from '../../src/lib/geo.js';

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
  const app = await startApp({ pool, ...opts });
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

const CENTER = { lat: 37.5665, lng: 126.978 };
const dLat = (m) => ((m / EARTH_RADIUS_M) * 180) / Math.PI;
const dLng = (m, lat) => dLat(m) / Math.cos((lat * Math.PI) / 180);
const nearby = (url, cookie, query = `lat=${CENTER.lat}&lng=${CENTER.lng}`) =>
  request(url, `/api/capsules/nearby?${query}`, { cookie });
const ids = (res) => res.body.capsules.map((c) => c.id).sort();

test('BE-08 FR-08 M-01 중심에서 남북 189m 캡슐은 포함, 212m 캡슐은 제외', async (t) => {
  const { url } = await start(t);
  const user = await loggedIn();
  const n189 = await insertCapsule(pool, { userId: user.id, lat: CENTER.lat + dLat(189), lng: CENTER.lng });
  const s189 = await insertCapsule(pool, { userId: user.id, lat: CENTER.lat - dLat(189), lng: CENTER.lng });
  await insertCapsule(pool, { userId: user.id, lat: CENTER.lat + dLat(212), lng: CENTER.lng });
  await insertCapsule(pool, { userId: user.id, lat: CENTER.lat - dLat(212), lng: CENTER.lng });

  const res = await nearby(url, user.cookie);
  assert.equal(res.status, 200);
  assert.deepEqual(ids(res), [n189.id, s189.id].sort());
});

test('BE-08 M-01 범위 박스 안이지만 반경 밖(대각선 약 276m)인 캡슐은 제외된다', async (t) => {
  const { url } = await start(t);
  const user = await loggedIn();
  await insertCapsule(pool, { userId: user.id, lat: CENTER.lat + dLat(195), lng: CENTER.lng + dLng(195, CENTER.lat) });
  const near = await insertCapsule(pool, { userId: user.id, lng: CENTER.lng + dLng(150, CENTER.lat) });
  const res = await nearby(url, user.cookie);
  assert.deepEqual(ids(res), [near.id]);
});

test('BE-08 BR-11 만료(expires_at 과거)·DELETED 캡슐은 목록에 없다', async (t) => {
  const { url } = await start(t);
  const user = await loggedIn();
  const active = await insertCapsule(pool, { userId: user.id });
  await insertCapsule(pool, { userId: user.id, expiresAt: new Date(Date.now() - 1000) });
  await insertCapsule(pool, { userId: user.id, status: 'DELETED' });
  const res = await nearby(url, user.cookie);
  assert.deepEqual(ids(res), [active.id]);
});

test('BE-08 FR-11 본인 캡슐은 is_mine true, 타인 캡슐은 false', async (t) => {
  const { url } = await start(t);
  const me = await loggedIn();
  const other = await insertUser(pool);
  const mine = await insertCapsule(pool, { userId: me.id });
  const theirs = await insertCapsule(pool, { userId: other.id });
  const res = await nearby(url, me.cookie);
  const byId = Object.fromEntries(res.body.capsules.map((c) => [c.id, c.is_mine]));
  assert.deepEqual(byId, { [mine.id]: true, [theirs.id]: false });
});

test('BE-08 NFR-06 응답 필드와 thumb_url 형식(/api/media/{media_id}/thumb), 원본 경로·user_id 없음', async (t) => {
  const { url } = await start(t);
  const user = await loggedIn();
  const other = await insertUser(pool);
  const cap = await insertCapsule(pool, { userId: other.id, title: '주변 캡슐' });
  const res = await nearby(url, user.cookie);
  assert.equal(res.status, 200);
  assert.deepEqual(Object.keys(res.body), ['capsules']);
  assert.equal(res.body.capsules.length, 1);
  const c = res.body.capsules[0];
  assert.deepEqual(Object.keys(c).sort(), ['id', 'is_mine', 'lat', 'lng', 'thumb_url', 'title']);
  assert.deepEqual(c, {
    id: cap.id,
    title: '주변 캡슐',
    lat: cap.lat,
    lng: cap.lng,
    thumb_url: `/api/media/${cap.media_id}/thumb`,
    is_mine: false,
  });
  const json = JSON.stringify(res.body);
  assert.ok(!json.includes(`/api/media/${cap.media_id}"`));
  assert.ok(!json.includes('.jpg'));
  assert.ok(!json.includes(other.id));
});

test('BE-08 주변에 캡슐이 없으면 빈 배열', async (t) => {
  const { url } = await start(t);
  const user = await loggedIn();
  const res = await nearby(url, user.cookie);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { capsules: [] });
});

test('BE-08 lat 누락·91, lng 문자열 등 잘못된 쿼리는 400 VALIDATION_FAILED', async (t) => {
  const { url } = await start(t);
  const user = await loggedIn();
  for (const q of [
    `lng=${CENTER.lng}`,
    `lat=${CENTER.lat}`,
    `lat=91&lng=${CENTER.lng}`,
    `lat=-91&lng=${CENTER.lng}`,
    `lat=${CENTER.lat}&lng=abc`,
    `lat=${CENTER.lat}&lng=181`,
    `lat=&lng=${CENTER.lng}`,
    `lat=1&lat=2&lng=${CENTER.lng}`,
    `lat=Infinity&lng=${CENTER.lng}`,
    '',
  ]) {
    assertError(await nearby(url, user.cookie, q), 400, 'VALIDATION_FAILED');
  }
});

test('BE-08 비로그인 401 AUTH_REQUIRED', async (t) => {
  const { url } = await start(t);
  assertError(await nearby(url), 401, 'AUTH_REQUIRED');
});
