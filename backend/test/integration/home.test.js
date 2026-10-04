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

const view = (capsuleId, userId) =>
  pool.query('INSERT INTO view_records (capsule_id, user_id, lat, lng, accuracy, ip_hash) VALUES ($1, $2, 37.5, 127, 5, $3)', [
    capsuleId,
    userId,
    'h',
  ]);
const past = new Date(Date.now() - 60000);

test('BE-19 /mine은 내 Active 캡슐만 최신순으로 주고 다른 사람의 열람 횟수를 센다', async (t) => {
  const app = await start(t);
  const me = await loggedIn();
  const other = await insertUser(pool);
  const first = await insertCapsule(pool, { userId: me.id, title: '첫째' });
  await pool.query("UPDATE capsules SET published_at = now() - interval '1 hour' WHERE id = $1", [first.id]);
  const second = await insertCapsule(pool, { userId: me.id, title: '둘째' });
  await insertCapsule(pool, { userId: me.id, status: 'DELETED' });
  await insertCapsule(pool, { userId: me.id, expiresAt: past });
  await insertCapsule(pool, { userId: other.id });
  await view(first.id, other.id);
  await view(first.id, other.id);
  await view(first.id, me.id);

  const res = await request(app.url, '/api/capsules/mine', { cookie: me.cookie });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.capsules.map((c) => c.id), [second.id, first.id]);
  assert.deepEqual(Object.keys(res.body.capsules[1]).sort(), ['expires_at', 'grade', 'id', 'lat', 'lng', 'thumb_url', 'title', 'view_count']);
  assert.equal(res.body.capsules[1].lat, 37.5665);
  assert.equal(res.body.capsules[1].lng, 126.978);
  assert.equal(res.body.capsules[1].view_count, 2);
  assert.equal(res.body.capsules[1].grade, 'BRONZE');
  assert.equal(res.body.capsules[1].thumb_url, `/api/media/${first.media_id}/thumb`);
  assert.equal(res.body.capsules[0].view_count, 0);
});

test('BE-19 /archive는 내가 연 Active 캡슐을 한 번씩만 준다', async (t) => {
  const app = await start(t);
  const me = await loggedIn();
  const other = await insertUser(pool);
  const opened = await insertCapsule(pool, { userId: other.id, title: '연 것' });
  const expired = await insertCapsule(pool, { userId: other.id });
  const deleted = await insertCapsule(pool, { userId: other.id });
  const notMine = await insertCapsule(pool, { userId: other.id });
  await view(opened.id, me.id);
  await view(opened.id, me.id);
  await view(expired.id, me.id);
  await view(deleted.id, me.id);
  await view(notMine.id, other.id);
  await pool.query('UPDATE capsules SET expires_at = $2 WHERE id = $1', [expired.id, past]);
  await pool.query("UPDATE capsules SET status = 'DELETED' WHERE id = $1", [deleted.id]);

  const res = await request(app.url, '/api/capsules/archive', { cookie: me.cookie });
  assert.equal(res.status, 200);
  assert.equal(res.body.capsules.length, 1);
  const [c] = res.body.capsules;
  assert.deepEqual(Object.keys(c).sort(), ['id', 'media_url', 'opened_at', 'thumb_url', 'title']);
  assert.equal(c.id, opened.id);
  assert.equal(c.media_url, `/api/media/${opened.media_id}`);
});

test('BE-19 로그인하지 않으면 401 AUTH_REQUIRED', async (t) => {
  const app = await start(t);
  for (const path of ['/api/capsules/mine', '/api/capsules/archive']) {
    const res = await request(app.url, path);
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'AUTH_REQUIRED');
  }
});
