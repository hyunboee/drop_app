import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import { createTestPool, setupTestDb, resetDb, insertUser, insertSession } from '../helpers/db.js';
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UPLOAD_HEADERS = { 'Content-Type': 'image/jpeg', 'If-None-Match': '*', 'x-amz-tagging': 'status=pending' };
const issue = (url, cookie) => request(url, '/api/uploads', { method: 'POST', cookie });

test('BE-05 FR-04 로그인 상태에서 200, media_id가 UUID이고 키가 media/{media_id}.jpg·media/{media_id}.thumb.jpg', async (t) => {
  const { url, storage } = await start(t);
  const { cookie } = await loggedIn();
  const res = await issue(url, cookie);
  assert.equal(res.status, 200);
  assert.deepEqual(Object.keys(res.body).sort(), ['media_id', 'original', 'thumb']);
  const id = res.body.media_id;
  assert.match(id, UUID_RE);

  const keys = storage.createUploadUrl.mock.calls.map((c) => c.arguments[0]);
  assert.deepEqual(keys.sort(), [`media/${id}.jpg`, `media/${id}.thumb.jpg`].sort());
  assert.ok(res.body.original.url.includes(`media/${id}.jpg`));
  assert.ok(res.body.thumb.url.includes(`media/${id}.thumb.jpg`));
});

test('BE-05 FR-04 업로드 URL 발급은 DB에 기록을 남기지 않는다', async (t) => {
  const { url } = await start(t);
  const { cookie } = await loggedIn();
  assert.equal((await issue(url, cookie)).status, 200);
  assert.equal(Number((await pool.query('SELECT count(*) FROM capsules')).rows[0].count), 0);
});

test('BE-05 NFR-05 두 번 호출하면 서로 다른 media_id와 키가 나온다', async (t) => {
  const { url, storage } = await start(t);
  const { cookie } = await loggedIn();
  const a = await issue(url, cookie);
  const b = await issue(url, cookie);
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  assert.notEqual(a.body.media_id, b.body.media_id);
  const keys = storage.createUploadUrl.mock.calls.map((c) => c.arguments[0]);
  assert.equal(new Set(keys).size, 4);
});

test('BE-05 응답 headers에 Content-Type·If-None-Match: *·x-amz-tagging이 원본·썸네일 모두 있다', async (t) => {
  const { url } = await start(t);
  const { cookie } = await loggedIn();
  const res = await issue(url, cookie);
  assert.deepEqual(res.body.original.headers, UPLOAD_HEADERS);
  assert.deepEqual(res.body.thumb.headers, UPLOAD_HEADERS);
});

test('BE-05 비로그인 401 AUTH_REQUIRED, URL 발급 없음', async (t) => {
  const { url, storage } = await start(t);
  const res = await issue(url);
  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, 'AUTH_REQUIRED');
  assert.equal(storage.createUploadUrl.mock.callCount(), 0);
});

test('BE-05 NFR-07 요청 로그에 Presigned URL이 남지 않는다', async (t) => {
  const log = mockLog(t);
  const { url } = await start(t);
  const { cookie } = await loggedIn();
  const res = await issue(url, cookie);
  assert.equal(res.status, 200);
  await waitLog(log, (l) => l.includes('/api/uploads'));
  const all = log.mock.calls.map((c) => c.arguments.map(String).join(' ')).join('\n');
  assert.ok(!all.includes('fake-s3'));
  assert.ok(!all.includes('X-Amz'));
  assert.ok(!all.includes(res.body.media_id));
});
