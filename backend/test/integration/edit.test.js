import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestPool, setupTestDb, resetDb, insertUser, insertSession, insertCapsule } from '../helpers/db.js';
import { startApp, request } from '../helpers/app.js';

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

async function start(t) {
  const app = await startApp({ pool });
  t.after(() => app.close());
  return app;
}

async function loggedIn() {
  const user = await insertUser(pool);
  const { cookie } = await insertSession(pool, user.id);
  return { ...user, cookie };
}

const patch = (url, cookie, id, body) => request(url, `/api/capsules/${id}`, { method: 'PATCH', cookie, body });
const rowOf = async (id) => (await pool.query('SELECT lat, lng, size_m, heading FROM capsules WHERE id = $1', [id])).rows[0];

test('주인은 크기와 방향을 다시 정할 수 있고 위치는 그대로다', async (t) => {
  const { url } = await start(t);
  const owner = await loggedIn();
  const cap = await insertCapsule(pool, { userId: owner.id, lat: 37.5, lng: 127.0, heading: 10 });
  const res = await patch(url, owner.cookie, cap.id, { size_m: 1.5, heading: 200 });
  assert.equal(res.status, 204);
  assert.deepEqual(await rowOf(cap.id), { lat: 37.5, lng: 127.0, size_m: 1.5, heading: 200 });
});

test('보낸 값만 바뀐다 (크기만 / 방향만)', async (t) => {
  const { url } = await start(t);
  const owner = await loggedIn();
  const cap = await insertCapsule(pool, { userId: owner.id, heading: 10 });
  assert.equal((await patch(url, owner.cookie, cap.id, { size_m: 0.8 })).status, 204);
  assert.deepEqual(await rowOf(cap.id), { lat: 37.5665, lng: 126.978, size_m: 0.8, heading: 10 });
  assert.equal((await patch(url, owner.cookie, cap.id, { heading: 90 })).status, 204);
  assert.equal((await rowOf(cap.id)).size_m, 0.8);
  assert.equal((await rowOf(cap.id)).heading, 90);
});

test('위치(lat, lng)나 모르는 필드를 보내면 400이고 아무것도 바뀌지 않는다', async (t) => {
  const { url } = await start(t);
  const owner = await loggedIn();
  const cap = await insertCapsule(pool, { userId: owner.id });
  for (const body of [{ lat: 1 }, { size_m: 1, lng: 2 }, { title: 'x' }, {}, { size_m: 0.05 }, { size_m: 3 }, { size_m: 'big' }, { heading: 360 }, { heading: -1 }]) {
    const res = await patch(url, owner.cookie, cap.id, body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.equal(res.body.error.code, 'VALIDATION_FAILED');
  }
  assert.deepEqual(await rowOf(cap.id), { lat: 37.5665, lng: 126.978, size_m: 0.4, heading: 0 });
});

test('주인이 아니면 403 NOT_OWNER, 없거나 지워진 캡슐은 404, 로그인 안 하면 401', async (t) => {
  const { url } = await start(t);
  const owner = await loggedIn();
  const other = await loggedIn();
  const cap = await insertCapsule(pool, { userId: owner.id });
  const gone = await insertCapsule(pool, { userId: owner.id, status: 'DELETED' });
  let res = await patch(url, other.cookie, cap.id, { size_m: 1 });
  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, 'NOT_OWNER');
  assert.equal((await rowOf(cap.id)).size_m, 0.4);
  res = await patch(url, owner.cookie, gone.id, { size_m: 1 });
  assert.equal(res.status, 404);
  res = await patch(url, undefined, cap.id, { size_m: 1 });
  assert.equal(res.status, 401);
});
