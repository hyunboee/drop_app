import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
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

const remove = (url, cookie, id) => request(url, `/api/capsules/${id}`, { method: 'DELETE', cookie });
const statusOf = async (id) => (await pool.query('SELECT status FROM capsules WHERE id = $1', [id])).rows[0].status;

test('BE-11 FR-11 소유자 삭제 204, 행 status DELETED, deleteObjects가 원본·썸네일 키로 호출', async (t) => {
  const { url, storage } = await start(t);
  const owner = await loggedIn();
  const cap = await insertCapsule(pool, { userId: owner.id });
  const res = await remove(url, owner.cookie, cap.id);
  assert.equal(res.status, 204);
  assert.equal(res.body, null);
  assert.equal(await statusOf(cap.id), 'DELETED');
  assert.deepEqual(
    storage.deleteObjects.mock.calls.map((c) => c.arguments),
    [[[`media/${cap.media_id}.jpg`, `media/${cap.media_id}.thumb.jpg`]]],
  );
});

test('BE-11 삭제 후 주변 조회에 나오지 않고 열람·미디어(원본·썸네일)는 404', async (t) => {
  const { url } = await start(t);
  const owner = await loggedIn();
  const cap = await insertCapsule(pool, { userId: owner.id });
  assert.equal((await remove(url, owner.cookie, cap.id)).status, 204);

  const near = await request(url, `/api/capsules/nearby?lat=${cap.lat}&lng=${cap.lng}`, { cookie: owner.cookie });
  assert.equal(near.status, 200);
  assert.deepEqual(near.body.capsules, []);

  const opened = await request(url, `/api/capsules/${cap.id}/open`, {
    method: 'POST',
    cookie: owner.cookie,
    body: { lat: cap.lat, lng: cap.lng, accuracy: 5 },
  });
  assertError(opened, 404, 'CAPSULE_NOT_FOUND');
  assertError(await request(url, `/api/media/${cap.media_id}`, { cookie: owner.cookie }), 404, 'CAPSULE_NOT_FOUND');
  assertError(await request(url, `/api/media/${cap.media_id}/thumb`, { cookie: owner.cookie }), 404, 'CAPSULE_NOT_FOUND');
});

test('BE-11 타인 캡슐 삭제 403 NOT_OWNER, 행 변화 없음, S3 삭제 미호출', async (t) => {
  const { url, storage } = await start(t);
  const owner = await insertUser(pool);
  const cap = await insertCapsule(pool, { userId: owner.id });
  const other = await loggedIn();
  assertError(await remove(url, other.cookie, cap.id), 403, 'NOT_OWNER');
  const { rows } = await pool.query('SELECT user_id, status, expires_at FROM capsules WHERE id = $1', [cap.id]);
  assert.deepEqual(rows, [{ user_id: owner.id, status: 'ACTIVE', expires_at: cap.expires_at }]);
  assert.equal(storage.deleteObjects.mock.callCount(), 0);
});

test('BE-11 없는·이미 삭제된·만료된 캡슐 404 CAPSULE_NOT_FOUND, S3 삭제 미호출', async (t) => {
  const { url, storage } = await start(t);
  const owner = await loggedIn();
  const deleted = await insertCapsule(pool, { userId: owner.id, status: 'DELETED' });
  const expired = await insertCapsule(pool, { userId: owner.id, expiresAt: new Date(Date.now() - 1000) });
  for (const id of [randomUUID(), deleted.id, expired.id]) {
    assertError(await remove(url, owner.cookie, id), 404, 'CAPSULE_NOT_FOUND');
  }
  assert.equal(storage.deleteObjects.mock.callCount(), 0);
});

test('BE-11 같은 캡슐을 두 번 삭제하면 두 번째는 404, deleteObjects는 한 번만', async (t) => {
  const { url, storage } = await start(t);
  const owner = await loggedIn();
  const cap = await insertCapsule(pool, { userId: owner.id });
  assert.equal((await remove(url, owner.cookie, cap.id)).status, 204);
  assertError(await remove(url, owner.cookie, cap.id), 404, 'CAPSULE_NOT_FOUND');
  assert.equal(storage.deleteObjects.mock.callCount(), 1);
});

test('BE-11 :id 형식 오류 400 VALIDATION_FAILED, 비로그인 401 AUTH_REQUIRED', async (t) => {
  const { url, storage } = await start(t);
  const owner = await loggedIn();
  const cap = await insertCapsule(pool, { userId: owner.id });
  assertError(await remove(url, owner.cookie, 'abc'), 400, 'VALIDATION_FAILED');
  assertError(await remove(url, undefined, cap.id), 401, 'AUTH_REQUIRED');
  assert.equal(await statusOf(cap.id), 'ACTIVE');
  assert.equal(storage.deleteObjects.mock.callCount(), 0);
});
