import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { setTimeout as sleep } from 'node:timers/promises';
import { createTestPool, setupTestDb, resetDb, insertUser, insertSession, insertCapsule } from '../helpers/db.js';
import { startApp, request } from '../helpers/app.js';
import { createFakeStorage } from '../helpers/aws.js';

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

function mockLog(t) {
  const log = mock.method(console, 'log', () => {});
  t.after(() => log.mock.restore());
  return log;
}

async function waitLog(logMock, pred) {
  for (let i = 0; i < 50; i++) {
    const hit = logMock.mock.calls.map((c) => c.arguments.join(' ')).find(pred);
    if (hit) return hit;
    await sleep(10);
  }
  assert.fail('기대한 로그 줄이 없음');
}

const assertError = (res, status, code) => {
  assert.equal(res.status, status);
  assert.equal(res.body.error.code, code);
};

const CACHE = 'private, max-age=31536000, immutable';
const original = (url, cookie, mediaId) => request(url, `/api/media/${mediaId}`, { cookie });
const thumb = (url, cookie, mediaId) => request(url, `/api/media/${mediaId}/thumb`, { cookie });

function assertImage(res, body) {
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/jpeg');
  assert.equal(res.headers.get('cache-control'), CACHE);
  assert.equal(res.body, body);
  const all = [...res.headers].flat().join('\n') + res.body;
  assert.ok(!all.includes('fake-s3'));
  assert.ok(!all.includes('amazonaws'));
  assert.ok(!all.includes('X-Amz'));
}

async function othersCapsule(opts = {}) {
  const owner = await loggedIn();
  const cap = await insertCapsule(pool, { userId: owner.id, ...opts });
  const viewer = await loggedIn();
  return { owner, cap, viewer };
}

test('BE-10 FR-10 비로그인 401 AUTH_REQUIRED (원본·썸네일 모두)', async (t) => {
  const { url, storage } = await start(t);
  const { cap } = await othersCapsule();
  assertError(await original(url, undefined, cap.media_id), 401, 'AUTH_REQUIRED');
  assertError(await thumb(url, undefined, cap.media_id), 401, 'AUTH_REQUIRED');
  assert.equal(storage.getObjectStream.mock.callCount(), 0);
});

test('BE-10 열람 기록 없는 타인 원본 403 MEDIA_FORBIDDEN, 같은 사용자의 썸네일은 200', async (t) => {
  const { url, storage } = await start(t);
  const { cap, viewer } = await othersCapsule();
  assertError(await original(url, viewer.cookie, cap.media_id), 403, 'MEDIA_FORBIDDEN');
  assert.equal(storage.getObjectStream.mock.callCount(), 0);

  const res = await thumb(url, viewer.cookie, cap.media_id);
  assertImage(res, `body:media/${cap.media_id}.thumb.jpg`);
  assert.deepEqual(storage.getObjectStream.mock.calls.map((c) => c.arguments[0]), [`media/${cap.media_id}.thumb.jpg`]);
});

test('BE-10 다른 사용자의 열람 기록으로는 원본을 받을 수 없다', async (t) => {
  const { url } = await start(t);
  const { cap, viewer } = await othersCapsule();
  const third = await loggedIn();
  const opened = await request(url, `/api/capsules/${cap.id}/open`, {
    method: 'POST',
    cookie: third.cookie,
    body: { lat: cap.lat, lng: cap.lng, accuracy: 5 },
  });
  assert.equal(opened.status, 200);
  assertError(await original(url, viewer.cookie, cap.media_id), 403, 'MEDIA_FORBIDDEN');
  assert.equal((await original(url, third.cookie, cap.media_id)).status, 200);
});

test('BE-10 NFR-05 BE-09 판정 통과 뒤 원본 200, Cache-Control·본문이 대체 스트림 내용과 같고 S3 URL 없음', async (t) => {
  const { url, storage } = await start(t);
  const { cap, viewer } = await othersCapsule();
  const opened = await request(url, `/api/capsules/${cap.id}/open`, {
    method: 'POST',
    cookie: viewer.cookie,
    body: { lat: cap.lat, lng: cap.lng, accuracy: 5 },
  });
  assert.equal(opened.status, 200);
  assert.equal(opened.body.media_url, `/api/media/${cap.media_id}`);

  const res = await request(url, opened.body.media_url, { cookie: viewer.cookie });
  assertImage(res, `body:media/${cap.media_id}.jpg`);
  assert.deepEqual(storage.getObjectStream.mock.calls.map((c) => c.arguments[0]), [`media/${cap.media_id}.jpg`]);
});

test('BE-10 소유자는 열람 기록 없이 원본·썸네일 200', async (t) => {
  const { url } = await start(t);
  const { owner, cap } = await othersCapsule();
  assertImage(await original(url, owner.cookie, cap.media_id), `body:media/${cap.media_id}.jpg`);
  assertImage(await thumb(url, owner.cookie, cap.media_id), `body:media/${cap.media_id}.thumb.jpg`);
  assert.equal(Number((await pool.query('SELECT count(*) FROM view_records')).rows[0].count), 0);
});

test('BE-10 BR-11 만료·DELETED 캡슐의 원본·썸네일은 소유자여도 404 CAPSULE_NOT_FOUND', async (t) => {
  const { url, storage } = await start(t);
  const owner = await loggedIn();
  const expired = await insertCapsule(pool, { userId: owner.id, expiresAt: new Date(Date.now() - 1000) });
  const deleted = await insertCapsule(pool, { userId: owner.id, status: 'DELETED' });
  for (const cap of [expired, deleted]) {
    assertError(await original(url, owner.cookie, cap.media_id), 404, 'CAPSULE_NOT_FOUND');
    assertError(await thumb(url, owner.cookie, cap.media_id), 404, 'CAPSULE_NOT_FOUND');
  }
  assert.equal(storage.getObjectStream.mock.callCount(), 0);
});

test('BE-10 아키텍처 2.3 없는 media_id와 UUID가 아닌 mediaId는 404 CAPSULE_NOT_FOUND', async (t) => {
  const { url, storage } = await start(t);
  const user = await loggedIn();
  const cap = await insertCapsule(pool, { userId: user.id });
  // 캡슐 id(≠ media_id)로는 미디어를 찾지 않는다
  assertError(await original(url, user.cookie, cap.id), 404, 'CAPSULE_NOT_FOUND');
  for (const bad of ['abc', 'not-a-uuid', `${cap.media_id}x`]) {
    assertError(await original(url, user.cookie, bad), 404, 'CAPSULE_NOT_FOUND');
    assertError(await thumb(url, user.cookie, bad), 404, 'CAPSULE_NOT_FOUND');
  }
  assert.equal(storage.getObjectStream.mock.callCount(), 0);
});

test('BE-10 R-11 스트리밍 도중 S3 오류면 오류 로그를 남기고 연결을 끊는다', async (t) => {
  const log = mockLog(t);
  const storage = createFakeStorage({
    getObjectStream: () =>
      Readable.from(
        (async function* () {
          yield Buffer.from('partial');
          await sleep(20);
          throw new Error('s3 broke');
        })(),
      ),
  });
  const { url } = await start(t, { storage });
  const owner = await loggedIn();
  const cap = await insertCapsule(pool, { userId: owner.id });

  await assert.rejects(original(url, owner.cookie, cap.media_id));
  const line = await waitLog(log, (l) => l.includes('s3 broke'));
  assert.equal(JSON.parse(line).level, 'error');
});
