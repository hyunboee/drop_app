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

async function loggedIn(email) {
  const user = await insertUser(pool, email ? { email } : {});
  const { cookie } = await insertSession(pool, user.id);
  return { ...user, cookie };
}

const post = (url, cookie, path, body) => request(url, path, { method: 'POST', cookie, body });
const nearbyIds = async (url, cookie) => (await request(url, '/api/capsules/nearby?lat=37.5665&lng=126.978', { cookie })).body.capsules.map((c) => c.id);

test('신고하면 신고한 사람에게만 그 캡슐이 사라지고 다른 사람에게는 그대로다', async (t) => {
  const { url } = await start(t);
  const owner = await loggedIn();
  const reporter = await loggedIn();
  const bystander = await loggedIn();
  const cap = await insertCapsule(pool, { userId: owner.id });
  const res = await post(url, reporter.cookie, `/api/capsules/${cap.id}/report`, { reason: 'SEXUAL', detail: '부적절한 사진이에요' });
  assert.equal(res.status, 204);
  assert.deepEqual(await nearbyIds(url, reporter.cookie), []);
  assert.deepEqual(await nearbyIds(url, bystander.cookie), [cap.id]);
  assert.deepEqual(await nearbyIds(url, owner.cookie), [cap.id]);
  const { rows } = await pool.query('SELECT reason, detail FROM reports WHERE capsule_id = $1', [cap.id]);
  assert.deepEqual(rows, [{ reason: 'SEXUAL', detail: '부적절한 사진이에요' }]);
});

test('같은 캡슐을 다시 신고해도 한 건만 남고 204다', async (t) => {
  const { url } = await start(t);
  const owner = await loggedIn();
  const reporter = await loggedIn();
  const cap = await insertCapsule(pool, { userId: owner.id });
  assert.equal((await post(url, reporter.cookie, `/api/capsules/${cap.id}/report`, { reason: 'ABUSE' })).status, 204);
  assert.equal((await post(url, reporter.cookie, `/api/capsules/${cap.id}/report`, { reason: 'OTHER' })).status, 204);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM reports')).rows[0].n, 1);
});

test('신고·차단 입력 검증: 사유 오류 400, 내 캡슐 400 SELF_TARGET, 없는 캡슐 404, 로그인 없으면 401', async (t) => {
  const { url } = await start(t);
  const owner = await loggedIn();
  const other = await loggedIn();
  const cap = await insertCapsule(pool, { userId: owner.id });
  const gone = await insertCapsule(pool, { userId: owner.id, status: 'DELETED' });
  for (const body of [{}, { reason: 'NOPE' }, { reason: 5 }, { reason: 'OTHER', detail: 'x'.repeat(501) }, { reason: 'OTHER', detail: 5 }]) {
    assert.equal((await post(url, other.cookie, `/api/capsules/${cap.id}/report`, body)).status, 400, JSON.stringify(body).slice(0, 40));
  }
  let res = await post(url, owner.cookie, `/api/capsules/${cap.id}/report`, { reason: 'OTHER' });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'SELF_TARGET');
  res = await post(url, owner.cookie, `/api/capsules/${cap.id}/block-owner`);
  assert.equal(res.body.error.code, 'SELF_TARGET');
  assert.equal((await post(url, other.cookie, `/api/capsules/${gone.id}/report`, { reason: 'OTHER' })).status, 404);
  assert.equal((await post(url, other.cookie, '/api/capsules/not-a-uuid/report', { reason: 'OTHER' })).status, 400);
  assert.equal((await post(url, undefined, `/api/capsules/${cap.id}/report`, { reason: 'OTHER' })).status, 401);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM reports')).rows[0].n, 0);
});

test('차단하면 그 사람의 모든 캡슐이 차단한 사람에게만 사라지고, 열람도 404다', async (t) => {
  const { url } = await start(t);
  const owner = await loggedIn();
  const blocker = await loggedIn();
  const capA = await insertCapsule(pool, { userId: owner.id, title: 'A' });
  const capB = await insertCapsule(pool, { userId: owner.id, title: 'B' });
  assert.equal((await post(url, blocker.cookie, `/api/capsules/${capA.id}/block-owner`)).status, 204);
  assert.deepEqual(await nearbyIds(url, blocker.cookie), []);
  const open = await post(url, blocker.cookie, `/api/capsules/${capB.id}/open`, { lat: 37.5665, lng: 126.978, accuracy: 5 });
  assert.equal(open.status, 404);
  // 차단당한 사람 쪽은 영향이 없다
  assert.deepEqual((await nearbyIds(url, owner.cookie)).sort(), [capA.id, capB.id].sort());
});

test('차단 목록은 일부만 가린 이메일을 보여 주고, 차단을 풀면 다시 보인다', async (t) => {
  const { url } = await start(t);
  const owner = await loggedIn('hyunboee@example.com');
  const blocker = await loggedIn();
  const cap = await insertCapsule(pool, { userId: owner.id });
  await post(url, blocker.cookie, `/api/capsules/${cap.id}/block-owner`);
  await post(url, blocker.cookie, `/api/capsules/${cap.id}/block-owner`); // 다시 차단해도 한 줄
  const list = await request(url, '/api/blocks', { cookie: blocker.cookie });
  assert.equal(list.body.blocks.length, 1);
  assert.equal(list.body.blocks[0].user_id, owner.id);
  assert.equal(list.body.blocks[0].label, 'h***@example.com');
  assert.deepEqual(Object.keys(list.body.blocks[0]).sort(), ['blocked_at', 'label', 'user_id']);
  assert.equal((await request(url, `/api/blocks/${owner.id}`, { method: 'DELETE', cookie: blocker.cookie })).status, 204);
  assert.deepEqual(await nearbyIds(url, blocker.cookie), [cap.id]);
  assert.equal((await request(url, '/api/blocks/not-a-uuid', { method: 'DELETE', cookie: blocker.cookie })).status, 400);
});

test('보관함에서도 차단한 사람의 캡슐은 빠진다', async (t) => {
  const { url } = await start(t);
  const owner = await loggedIn();
  const viewer = await loggedIn();
  const cap = await insertCapsule(pool, { userId: owner.id });
  await pool.query('INSERT INTO view_records (capsule_id, user_id, lat, lng, accuracy, ip_hash) VALUES ($1, $2, 37.5, 127, 5, $3)', [cap.id, viewer.id, 'h']);
  assert.equal((await request(url, '/api/capsules/archive', { cookie: viewer.cookie })).body.capsules.length, 1);
  await post(url, viewer.cookie, `/api/capsules/${cap.id}/block-owner`);
  assert.equal((await request(url, '/api/capsules/archive', { cookie: viewer.cookie })).body.capsules.length, 0);
});
