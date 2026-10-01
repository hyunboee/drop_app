import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestPool, setupTestDb, resetDb, insertUser, insertSession, insertCapsule } from '../helpers/db.js';
import { createPool, withTransaction } from '../../src/db.js';
import { hashToken } from '../../src/services/auth.js';
import { TERMS_VERSION } from '../../src/params.js';

const TABLES = ['users', 'sessions', 'capsules', 'view_records'];

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

const count = async (table) => Number((await pool.query(`SELECT count(*) FROM ${table}`)).rows[0].count);

test('DB-02 setupTestDb로 마이그레이션이 테스트 DB에 적용되어 있다', async () => {
  const { rows } = await pool.query("SELECT 1 FROM schema_migrations WHERE filename = '001_init.sql'");
  assert.equal(rows.length, 1);
});

test('DB-02 TRUNCATE 후 4개 테이블 행 수가 0이다', async () => {
  const user = await insertUser(pool);
  await insertSession(pool, user.id);
  const capsule = await insertCapsule(pool, { userId: user.id });
  await pool.query(
    'INSERT INTO view_records (capsule_id, user_id, lat, lng, accuracy, ip_hash) VALUES ($1, $2, 37.5, 127, 5, $3)',
    [capsule.id, user.id, 'hash'],
  );
  for (const t of TABLES) assert.equal(await count(t), 1, t);

  await resetDb(pool);
  for (const t of TABLES) assert.equal(await count(t), 0, t);
});

test('DB-02 DB 이름이 _test로 끝나지 않으면 헬퍼가 오류를 던진다', () => {
  assert.throws(() => createTestPool('postgres://u:p@localhost:5432/drop_app'));
});

test('DB-02 insertUser 행이 CHECK·약관 버전을 만족하고 로그인용 password를 돌려준다', async () => {
  const user = await insertUser(pool);
  assert.match(user.email, /^user-.+@example\.com$/);
  assert.equal(user.email, user.email.toLowerCase());
  assert.equal(user.password, 'password123');
  const { rows } = await pool.query('SELECT email, password_salt, password_hash, terms_version FROM users WHERE id = $1', [user.id]);
  assert.equal(rows[0].email, user.email);
  assert.equal(rows[0].terms_version, TERMS_VERSION);
  assert.ok(rows[0].password_salt.length > 0);
  assert.notEqual(rows[0].password_hash, 'password123');
});

test('DB-02 insertUser는 지정한 email·password를 쓴다', async () => {
  const user = await insertUser(pool, { email: 'fixed@example.com', password: 'another-pw' });
  assert.equal(user.email, 'fixed@example.com');
  assert.equal(user.password, 'another-pw');
});

test('DB-02 insertCapsule 행이 FK·CHECK를 만족하고 기본값이 들어간다', async () => {
  const user = await insertUser(pool);
  const c = await insertCapsule(pool, { userId: user.id });
  assert.equal(c.user_id, user.id);
  assert.equal(c.status, 'ACTIVE');
  assert.equal(c.lat, 37.5665);
  assert.equal(c.lng, 126.978);
  const { rows } = await pool.query(
    "SELECT title, grade, accuracy, heading, expires_at - published_at = interval '720 hours' AS ttl_ok FROM capsules WHERE id = $1",
    [c.id],
  );
  assert.deepEqual(rows[0], { title: '테스트 캡슐', grade: 'BRONZE', accuracy: 5, heading: 0, ttl_ok: true });
});

test('DB-02 insertCapsule은 지정한 상태·만료 시각·좌표를 쓴다', async () => {
  const user = await insertUser(pool);
  const expiresAt = new Date(Date.now() - 60_000);
  const c = await insertCapsule(pool, { userId: user.id, title: 'x', lat: 10, lng: 20, status: 'DELETED', expiresAt });
  const { rows } = await pool.query('SELECT title, lat, lng, status, expires_at FROM capsules WHERE id = $1', [c.id]);
  assert.equal(rows[0].title, 'x');
  assert.equal(rows[0].lat, 10);
  assert.equal(rows[0].lng, 20);
  assert.equal(rows[0].status, 'DELETED');
  assert.equal(rows[0].expires_at.getTime(), expiresAt.getTime());
});

test('DB-02 insertSession은 토큰 해시만 저장하고 sid 쿠키를 돌려준다', async () => {
  const user = await insertUser(pool);
  const { token, cookie } = await insertSession(pool, user.id);
  assert.equal(cookie, 'sid=' + token);
  const { rows } = await pool.query('SELECT token_hash, expires_at > now() AS active FROM sessions WHERE user_id = $1', [user.id]);
  assert.equal(rows[0].token_hash, hashToken(token));
  assert.notEqual(rows[0].token_hash, token);
  assert.equal(rows[0].active, true);
});

test('DB-02 insertSession에 과거 expiresAt을 주면 만료 세션이 된다', async () => {
  const user = await insertUser(pool);
  await insertSession(pool, user.id, { expiresAt: new Date(Date.now() - 1000) });
  const { rows } = await pool.query('SELECT expires_at > now() AS active FROM sessions WHERE user_id = $1', [user.id]);
  assert.equal(rows[0].active, false);
});

test('BE-01 createPool은 DB_POOL_MAX를 max로 쓴다', async () => {
  const p = createPool({ databaseUrl: process.env.DATABASE_URL, dbPoolMax: 3 });
  try {
    assert.equal(p.options.max, 3);
    assert.equal((await p.query('SELECT 1 AS one')).rows[0].one, 1);
  } finally {
    await p.end();
  }
});

test('BE-01 withTransaction 성공 시 COMMIT하고 fn 결과를 돌려준다', async () => {
  const user = await insertUser(pool);
  const result = await withTransaction(pool, async (c) => {
    await c.query("UPDATE users SET terms_version = 'tx' WHERE id = $1", [user.id]);
    return 'done';
  });
  assert.equal(result, 'done');
  const { rows } = await pool.query('SELECT terms_version FROM users WHERE id = $1', [user.id]);
  assert.equal(rows[0].terms_version, 'tx');
});

test('BE-01 withTransaction 오류 시 ROLLBACK하고 같은 오류를 다시 던진다', async () => {
  const user = await insertUser(pool);
  const boom = new Error('boom');
  await assert.rejects(
    withTransaction(pool, async (c) => {
      await c.query("UPDATE users SET terms_version = 'tx' WHERE id = $1", [user.id]);
      throw boom;
    }),
    (err) => err === boom,
  );
  const { rows } = await pool.query('SELECT terms_version FROM users WHERE id = $1', [user.id]);
  assert.equal(rows[0].terms_version, TERMS_VERSION);
  // 커넥션이 반환되어 풀이 계속 쓸 수 있다
  assert.equal(pool.totalCount - pool.idleCount, 0);
});
