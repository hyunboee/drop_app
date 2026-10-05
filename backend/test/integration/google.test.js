import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestPool, setupTestDb, resetDb, insertUser } from '../helpers/db.js';
import { startApp, request } from '../helpers/app.js';
import { AppError } from '../../src/errors.js';
import { createGoogleVerifier } from '../../src/lib/google.js';

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

// 구글에 묻지 않고 토큰 문자열 그대로를 사용자 정보로 쓰는 가짜 확인기: "sub|email"
const fakeVerify = async (idToken) => {
  if (idToken === 'bad') throw new AppError('GOOGLE_AUTH_FAILED');
  const [sub, email] = idToken.split('|');
  return { sub, email };
};

async function start(t) {
  const app = await startApp({ pool, googleVerify: fakeVerify });
  t.after(() => app.close());
  return app;
}

const google = (url, body) => request(url, '/api/auth/google', { method: 'POST', body, headers: { 'X-Client': 'app' } });
const consents = { agree_terms: true, agree_location: true, agree_age: true };

test('처음 구글로 오면 동의 없이는 400 CONSENT_REQUIRED이고 사용자가 만들어지지 않는다', async (t) => {
  const { url } = await start(t);
  const res = await google(url, { id_token: 'g1|new@example.com' });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'CONSENT_REQUIRED');
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM users')).rows[0].n, 0);
});

test('동의하면 가입되고(201) 앱에는 토큰을 주며, 비밀번호 없이 google_sub로 저장된다', async (t) => {
  const { url } = await start(t);
  const res = await google(url, { id_token: 'g1|new@example.com', ...consents });
  assert.equal(res.status, 201);
  assert.equal(res.body.email, 'new@example.com');
  assert.ok(res.body.token);
  const { rows } = await pool.query('SELECT google_sub, password_hash, terms_version FROM users WHERE email = $1', ['new@example.com']);
  assert.equal(rows[0].google_sub, 'g1');
  assert.equal(rows[0].password_hash, null);
  const me = await request(url, '/api/me', { headers: { 'X-Client': 'app', Authorization: `Bearer ${res.body.token}` } });
  assert.equal(me.status, 200);
  assert.equal(me.body.email, 'new@example.com');
});

test('다시 구글로 오면 동의 없이 200으로 로그인되고 같은 사용자다', async (t) => {
  const { url } = await start(t);
  const first = await google(url, { id_token: 'g1|a@example.com', ...consents });
  const again = await google(url, { id_token: 'g1|a@example.com' });
  assert.equal(again.status, 200);
  assert.equal(again.body.id, first.body.id);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM users')).rows[0].n, 1);
});

test('같은 이메일로 가입한 계정이 있으면 새로 만들지 않고 구글 계정을 연결한다', async (t) => {
  const { url } = await start(t);
  const existing = await insertUser(pool, { email: 'same@example.com' });
  const res = await google(url, { id_token: 'g9|same@example.com' });
  assert.equal(res.status, 200);
  assert.equal(res.body.id, existing.id);
  assert.equal((await pool.query('SELECT google_sub FROM users WHERE id = $1', [existing.id])).rows[0].google_sub, 'g9');
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM users')).rows[0].n, 1);
});

test('구글로만 가입한 계정은 비밀번호 로그인이 401 INVALID_CREDENTIALS다', async (t) => {
  const { url } = await start(t);
  await google(url, { id_token: 'g1|g@example.com', ...consents });
  const res = await request(url, '/api/auth/login', { method: 'POST', body: { email: 'g@example.com', password: 'anything123' } });
  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, 'INVALID_CREDENTIALS');
});

test('토큰이 틀리면 401 GOOGLE_AUTH_FAILED, 토큰이 없거나 형식이 틀리면 400', async (t) => {
  const { url } = await start(t);
  let res = await google(url, { id_token: 'bad', ...consents });
  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, 'GOOGLE_AUTH_FAILED');
  for (const body of [{}, { id_token: '' }, { id_token: 5 }, { id_token: 'x'.repeat(5000) }]) {
    res = await google(url, body);
    assert.equal(res.status, 400, JSON.stringify(body).slice(0, 40));
  }
});

test('확인기가 없는 서버는 구글 로그인을 401로 막는다', async (t) => {
  const app = await startApp({ pool });
  t.after(() => app.close());
  const res = await google(app.url, { id_token: 'g1|a@example.com', ...consents });
  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, 'GOOGLE_AUTH_FAILED');
});

// ---------- 구글 확인기 ----------
const claims = (over = {}) => ({ aud: 'cid', iss: 'https://accounts.google.com', exp: String(Math.floor(Date.now() / 1000) + 600), email_verified: 'true', sub: 'S', email: 'U@Example.com', ...over });
const okFetch = (body, ok = true) => async () => ({ ok, json: async () => body });

test('확인기: 올바른 토큰은 sub와 소문자 이메일을 돌려준다', async () => {
  assert.deepEqual(await createGoogleVerifier('cid', okFetch(claims()))('t'), { sub: 'S', email: 'u@example.com' });
});

test('확인기: 대상(aud)·발급자·만료·이메일 확인·형식이 틀리면 모두 GOOGLE_AUTH_FAILED', async () => {
  const cases = [
    claims({ aud: 'other' }),
    claims({ iss: 'evil.com' }),
    claims({ exp: String(Math.floor(Date.now() / 1000) - 10) }),
    claims({ email_verified: 'false' }),
    claims({ sub: undefined }),
    claims({ email: undefined }),
  ];
  for (const c of cases) {
    await assert.rejects(createGoogleVerifier('cid', okFetch(c))('t'), { code: 'GOOGLE_AUTH_FAILED' });
  }
  await assert.rejects(createGoogleVerifier('cid', okFetch({}, false))('t'), { code: 'GOOGLE_AUTH_FAILED' });
  await assert.rejects(createGoogleVerifier('cid', async () => { throw new Error('network'); })('t'), { code: 'GOOGLE_AUTH_FAILED' });
  await assert.rejects(createGoogleVerifier('', okFetch(claims()))('t'), { code: 'GOOGLE_AUTH_FAILED' });
});
