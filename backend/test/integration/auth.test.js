import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { createTestPool, setupTestDb, resetDb, insertUser, insertSession } from '../helpers/db.js';
import { startApp, request, sidCookie } from '../helpers/app.js';
import { verifyPassword } from '../../src/services/auth.js';
import {
  M_04_SESSION_TTL_SEC,
  M_05_LOGIN_LOCK_MS,
  M_05_LOGIN_MAX_FAILURES,
  M_10_PASSWORD_MIN_LENGTH,
  TERMS_VERSION,
} from '../../src/params.js';

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

const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const uniqueEmail = (prefix = 'new') => `${prefix}-${randomUUID()}@example.com`;
const signupBody = (over = {}) => ({
  email: uniqueEmail(),
  password: 'password123',
  agree_terms: true,
  agree_location: true,
  agree_age: true,
  ...over,
});

const signup = (url, body) => request(url, '/api/auth/signup', { method: 'POST', body });
const login = (url, email, password) => request(url, '/api/auth/login', { method: 'POST', body: { email, password } });
const me = (url, cookie) => request(url, '/api/me', { cookie });
const logout = (url, cookie) => request(url, '/api/auth/logout', { method: 'POST', cookie });

function setCookieParts(res) {
  const raw = res.headers.getSetCookie().find((c) => c.startsWith('sid='));
  assert.ok(raw, 'sid Set-Cookie 없음');
  return raw.split(';').map((s) => s.trim());
}

// 세션 쿠키 속성을 확인하고 토큰 원문을 돌려준다
function assertSessionCookie(res) {
  const parts = setCookieParts(res);
  for (const attr of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/', `Max-Age=${M_04_SESSION_TTL_SEC}`]) {
    assert.ok(parts.includes(attr), attr);
  }
  const token = parts[0].slice('sid='.length);
  assert.ok(token.length > 0);
  return token;
}

const assertError = (res, status, code) => {
  assert.equal(res.status, status);
  assert.equal(res.body.error.code, code);
};

const count = async (sql, params) => Number((await pool.query(sql, params)).rows[0].count);

// ---------- BE-02 가입 ----------

test('BE-02 FR-01 가입 201, HttpOnly·Secure·SameSite=Strict·Max-Age(M-04) 쿠키, DB에는 토큰 해시만 저장', async (t) => {
  const { url } = await start(t);
  const body = signupBody();
  const res = await signup(url, body);
  assert.equal(res.status, 201);
  assert.deepEqual(Object.keys(res.body).sort(), ['email', 'id']);
  assert.equal(res.body.email, body.email);

  const token = assertSessionCookie(res);
  const { rows } = await pool.query(
    'SELECT token_hash, extract(epoch FROM expires_at - now()) AS sec FROM sessions WHERE user_id = $1',
    [res.body.id],
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].token_hash, sha256(token));
  assert.notEqual(rows[0].token_hash, token);
  assert.ok(Math.abs(Number(rows[0].sec) - M_04_SESSION_TTL_SEC) < 60);
});

test('BE-02 W-02 가입 응답 쿠키로 바로 보호 API를 호출할 수 있다', async (t) => {
  const { url } = await start(t);
  const res = await signup(url, signupBody());
  const r = await me(url, sidCookie(res));
  assert.equal(r.status, 200);
  assert.equal(r.body.id, res.body.id);
});

test('BE-02 가입 이메일은 소문자로 저장된다', async (t) => {
  const { url } = await start(t);
  const email = `Mixed-${randomUUID()}@Example.COM`;
  const res = await signup(url, signupBody({ email }));
  assert.equal(res.status, 201);
  assert.equal(res.body.email, email.toLowerCase());
  const { rows } = await pool.query('SELECT email FROM users WHERE id = $1', [res.body.id]);
  assert.equal(rows[0].email, email.toLowerCase());
});

test('BE-02 users.password_hash가 평문과 다르고 terms_version이 저장된다', async (t) => {
  const { url } = await start(t);
  const body = signupBody();
  const res = await signup(url, body);
  const { rows } = await pool.query(
    'SELECT password_salt, password_hash, terms_version FROM users WHERE id = $1',
    [res.body.id],
  );
  assert.notEqual(rows[0].password_hash, body.password);
  assert.ok(!rows[0].password_hash.includes(body.password));
  assert.equal(rows[0].terms_version, TERMS_VERSION);
  assert.equal(await verifyPassword(body.password, rows[0].password_salt, rows[0].password_hash), true);
});

test('BE-02 이메일 대소문자만 다른 중복 가입 409 EMAIL_TAKEN, 행·세션 추가 없음', async (t) => {
  const { url } = await start(t);
  const id = randomUUID();
  const first = await signup(url, signupBody({ email: `A-${id}@x.com` }));
  assert.equal(first.status, 201);
  const dup = await signup(url, signupBody({ email: `a-${id}@X.com` }));
  assertError(dup, 409, 'EMAIL_TAKEN');
  assert.equal(sidCookie(dup), null);
  assert.equal(await count('SELECT count(*) FROM users'), 1);
  assert.equal(await count('SELECT count(*) FROM sessions'), 1);
});

test('BE-02 비밀번호 M-10 미만(7자) 400 VALIDATION_FAILED, 8자는 201', async (t) => {
  const { url } = await start(t);
  const short = await signup(url, signupBody({ password: 'a'.repeat(M_10_PASSWORD_MIN_LENGTH - 1) }));
  assertError(short, 400, 'VALIDATION_FAILED');
  const ok = await signup(url, signupBody({ password: 'a'.repeat(M_10_PASSWORD_MIN_LENGTH) }));
  assert.equal(ok.status, 201);
});

test('BE-02 비밀번호가 문자열이 아니면 400 VALIDATION_FAILED', async (t) => {
  const { url } = await start(t);
  for (const password of [12345678, undefined, null]) {
    assertError(await signup(url, signupBody({ password })), 400, 'VALIDATION_FAILED');
  }
});

test('BE-02 이메일 형식 오류 400 VALIDATION_FAILED', async (t) => {
  const { url } = await start(t);
  for (const email of ['no-at-sign', 'a@b', 'a b@c.com', '@example.com', 'a@.', '', 123, undefined]) {
    assertError(await signup(url, signupBody({ email })), 400, 'VALIDATION_FAILED');
  }
  assert.equal(await count('SELECT count(*) FROM users'), 0);
});

test('BE-02 동의 3개 중 하나라도 누락·false·문자열이면 400 VALIDATION_FAILED', async (t) => {
  const { url } = await start(t);
  for (const key of ['agree_terms', 'agree_location', 'agree_age']) {
    const missing = signupBody();
    delete missing[key];
    assertError(await signup(url, missing), 400, 'VALIDATION_FAILED');
    assertError(await signup(url, signupBody({ [key]: false })), 400, 'VALIDATION_FAILED');
    assertError(await signup(url, signupBody({ [key]: 'true' })), 400, 'VALIDATION_FAILED');
  }
  assert.equal(await count('SELECT count(*) FROM users'), 0);
});

test('BE-02 가입 본문이 객체가 아니면 400 VALIDATION_FAILED', async (t) => {
  const { url } = await start(t);
  const res = await request(url, '/api/auth/signup', {
    method: 'POST',
    body: '"just-a-string"',
    headers: { 'Content-Type': 'application/json' },
  });
  assertError(res, 400, 'VALIDATION_FAILED');
});

test('BE-02 가입 요청 로그에는 마스킹된 이메일만 남는다', async (t) => {
  const log = mockLog(t);
  const { url } = await start(t);
  const id = randomUUID();
  const email = `zed-${id}@example.com`;
  await signup(url, signupBody({ email }));
  const line = await waitLog(log, (l) => l.includes('/api/auth/signup'));
  assert.ok(!line.includes(email));
  assert.ok(!line.includes(id));
  assert.equal(JSON.parse(line).email, 'z***@example.com');
});

test('BE-02 가입 중 DB 오류(UNIQUE 위반 외)는 500 INTERNAL_ERROR', async (t) => {
  mockLog(t);
  const boom = async () => { throw new Error('db down secret'); };
  const { url } = await start(t, { pool: { query: boom, connect: boom } });
  const res = await signup(url, signupBody());
  assertError(res, 500, 'INTERNAL_ERROR');
  assert.ok(!JSON.stringify(res.body).includes('db down secret'));
});

// ---------- BE-02 로그인 ----------

test('BE-02 로그인 성공 200 + 세션 쿠키, 그 유저의 만료 세션만 삭제된다', async (t) => {
  const { url } = await start(t);
  const user = await insertUser(pool);
  const other = await insertUser(pool);
  const past = new Date(Date.now() - 60_000);
  const expired = await insertSession(pool, user.id, { expiresAt: past });
  const active = await insertSession(pool, user.id);
  const otherExpired = await insertSession(pool, other.id, { expiresAt: past });

  const res = await login(url, user.email, user.password);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { id: user.id, email: user.email });
  const token = assertSessionCookie(res);

  const hashes = (await pool.query('SELECT token_hash FROM sessions WHERE user_id = $1', [user.id])).rows.map(
    (r) => r.token_hash,
  );
  assert.ok(!hashes.includes(sha256(expired.token)), '만료 세션이 남아 있음');
  assert.ok(hashes.includes(sha256(active.token)), '유효 세션이 지워짐');
  assert.ok(hashes.includes(sha256(token)), '새 세션 해시 없음');
  assert.ok(!hashes.includes(token));
  assert.equal(hashes.length, 2);
  assert.equal(await count('SELECT count(*) FROM sessions WHERE token_hash = $1', [sha256(otherExpired.token)]), 1);
});

test('BE-02 로그인 이메일은 대소문자를 구분하지 않는다', async (t) => {
  const { url } = await start(t);
  const user = await insertUser(pool);
  const res = await login(url, user.email.toUpperCase(), user.password);
  assert.equal(res.status, 200);
  assert.equal(res.body.email, user.email);
});

test('BE-02 비밀번호 불일치와 미가입 이메일이 같은 메시지의 401 INVALID_CREDENTIALS', async (t) => {
  const { url } = await start(t);
  const user = await insertUser(pool);
  const wrong = await login(url, user.email, 'wrong-password');
  const ghost = await login(url, uniqueEmail('ghost'), 'password123');
  assertError(wrong, 401, 'INVALID_CREDENTIALS');
  assertError(ghost, 401, 'INVALID_CREDENTIALS');
  assert.equal(wrong.body.error.message, ghost.body.error.message);
  assert.equal(sidCookie(wrong), null);
  assert.equal(sidCookie(ghost), null);
  assert.equal(await count('SELECT count(*) FROM sessions'), 0);
});

test('BE-02 로그인 email·password가 비어 있지 않은 문자열이 아니면 400 VALIDATION_FAILED', async (t) => {
  const { url } = await start(t);
  const user = await insertUser(pool);
  const cases = [
    { password: user.password },
    { email: user.email },
    { email: '', password: user.password },
    { email: user.email, password: '' },
    { email: 123, password: user.password },
    { email: user.email, password: 12345678 },
  ];
  for (const body of cases) {
    assertError(await request(url, '/api/auth/login', { method: 'POST', body }), 400, 'VALIDATION_FAILED');
  }
});

test('BE-02 M-05 5번째 실패까지 401, 6번째 요청은 올바른 비밀번호여도 429 ACCOUNT_LOCKED', async (t) => {
  let now = Date.now();
  const { url } = await start(t, { now: () => now });
  const user = await insertUser(pool);
  for (let i = 1; i <= M_05_LOGIN_MAX_FAILURES; i++) {
    assertError(await login(url, user.email, 'wrong-password'), 401, 'INVALID_CREDENTIALS');
  }
  const locked = await login(url, user.email, user.password);
  assertError(locked, 429, 'ACCOUNT_LOCKED');
  assert.equal(sidCookie(locked), null);
  assert.equal(await count('SELECT count(*) FROM sessions'), 0);
});

test('BE-02 미가입 이메일도 6번째 요청에 429', async (t) => {
  let now = Date.now();
  const { url } = await start(t, { now: () => now });
  const ghost = uniqueEmail('ghost');
  for (let i = 1; i <= M_05_LOGIN_MAX_FAILURES; i++) {
    assertError(await login(url, ghost, 'password123'), 401, 'INVALID_CREDENTIALS');
  }
  assertError(await login(url, ghost, 'password123'), 429, 'ACCOUNT_LOCKED');
});

test('BE-02 잠금 중 요청은 잠금을 늘리지 않고, M-05 시간 경과 시(시간 대체) 다시 로그인 가능', async (t) => {
  let now = Date.now();
  const { url } = await start(t, { now: () => now });
  const user = await insertUser(pool);
  for (let i = 0; i < M_05_LOGIN_MAX_FAILURES; i++) await login(url, user.email, 'wrong-password');
  const lockStart = now;

  now = lockStart + M_05_LOGIN_LOCK_MS - 1;
  assertError(await login(url, user.email, 'wrong-password'), 429, 'ACCOUNT_LOCKED');
  assertError(await login(url, user.email, user.password), 429, 'ACCOUNT_LOCKED');

  now = lockStart + M_05_LOGIN_LOCK_MS;
  const res = await login(url, user.email, user.password);
  assert.equal(res.status, 200);
  assertSessionCookie(res);
});

test('BE-02 미가입 이메일 잠금도 M-05 경과 후 해제되어 다시 401', async (t) => {
  let now = Date.now();
  const { url } = await start(t, { now: () => now });
  const ghost = uniqueEmail('ghost');
  for (let i = 0; i < M_05_LOGIN_MAX_FAILURES; i++) await login(url, ghost, 'password123');
  assertError(await login(url, ghost, 'password123'), 429, 'ACCOUNT_LOCKED');
  now += M_05_LOGIN_LOCK_MS;
  assertError(await login(url, ghost, 'password123'), 401, 'INVALID_CREDENTIALS');
});

test('BE-02 잠금 카운터는 소문자 이메일 기준이다', async (t) => {
  let now = Date.now();
  const { url } = await start(t, { now: () => now });
  const user = await insertUser(pool);
  for (let i = 0; i < M_05_LOGIN_MAX_FAILURES; i++) {
    await login(url, i % 2 ? user.email.toUpperCase() : user.email, 'wrong-password');
  }
  assertError(await login(url, user.email, user.password), 429, 'ACCOUNT_LOCKED');
});

test('BE-02 로그인 성공 시 실패 횟수가 초기화된다', async (t) => {
  let now = Date.now();
  const { url } = await start(t, { now: () => now });
  const user = await insertUser(pool);
  for (let i = 0; i < M_05_LOGIN_MAX_FAILURES - 1; i++) await login(url, user.email, 'wrong-password');
  assert.equal((await login(url, user.email, user.password)).status, 200);
  for (let i = 0; i < M_05_LOGIN_MAX_FAILURES - 1; i++) {
    assertError(await login(url, user.email, 'wrong-password'), 401, 'INVALID_CREDENTIALS');
  }
  assert.equal((await login(url, user.email, user.password)).status, 200);
});

// ---------- BE-03 세션·로그아웃·me ----------

test('BE-03 FR-01 쿠키 없음으로 보호 API 호출 시 401 AUTH_REQUIRED', async (t) => {
  const { url } = await start(t);
  assertError(await me(url), 401, 'AUTH_REQUIRED');
});

test('BE-03 FR-01 위조 토큰(sid=forged)으로 보호 API 호출 시 401 AUTH_REQUIRED', async (t) => {
  const { url } = await start(t);
  assertError(await me(url, 'sid=forged'), 401, 'AUTH_REQUIRED');
});

test('BE-03 FR-01 만료 세션(expires_at 과거)으로 보호 API 호출 시 401 AUTH_REQUIRED', async (t) => {
  const { url } = await start(t);
  const user = await insertUser(pool);
  const { cookie } = await insertSession(pool, user.id, { expiresAt: new Date(Date.now() - 1000) });
  assertError(await me(url, cookie), 401, 'AUTH_REQUIRED');
});

test('BE-03 sid가 없는 쿠키 헤더는 401, 다른 쿠키와 섞인 sid는 인식한다', async (t) => {
  const { url } = await start(t);
  const user = await insertUser(pool);
  const { token } = await insertSession(pool, user.id);
  assertError(await me(url, 'foo=bar; theme=dark'), 401, 'AUTH_REQUIRED');
  assertError(await me(url, `xsid=${token}`), 401, 'AUTH_REQUIRED');
  const res = await me(url, `foo=bar; sid=${token}; theme=dark`);
  assert.equal(res.status, 200);
  assert.equal(res.body.id, user.id);
});

test('BE-03 GET /api/health, POST /api/auth/signup, POST /api/auth/login은 쿠키 없이도 401이 아니다', async (t) => {
  const { url } = await start(t);
  const health = await request(url, '/api/health');
  assert.equal(health.status, 200);
  assertError(await request(url, '/api/auth/signup', { method: 'POST' }), 400, 'VALIDATION_FAILED');
  assertError(await request(url, '/api/auth/login', { method: 'POST' }), 400, 'VALIDATION_FAILED');
  assertError(await request(url, '/api/auth/signup', { method: 'POST', body: {} }), 400, 'VALIDATION_FAILED');
  assertError(await request(url, '/api/auth/login', { method: 'POST', body: {} }), 400, 'VALIDATION_FAILED');
});

test('BE-03 로그인 쿠키로 logout 204, 세션 행 삭제, Max-Age=0으로 sid 쿠키 삭제, 같은 쿠키 재호출 401', async (t) => {
  const { url } = await start(t);
  const user = await insertUser(pool);
  const other = await insertSession(pool, user.id);
  const loggedIn = await login(url, user.email, user.password);
  const cookie = sidCookie(loggedIn);
  const token = cookie.slice('sid='.length);

  const res = await logout(url, cookie);
  assert.equal(res.status, 204);
  assert.equal(res.body, null);
  const parts = setCookieParts(res);
  assert.equal(parts[0], 'sid=');
  for (const attr of ['Max-Age=0', 'HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/']) {
    assert.ok(parts.includes(attr), attr);
  }

  assert.equal(await count('SELECT count(*) FROM sessions WHERE token_hash = $1', [sha256(token)]), 0);
  // 같은 유저의 다른 세션은 그대로
  assert.equal(await count('SELECT count(*) FROM sessions WHERE token_hash = $1', [sha256(other.token)]), 1);

  assertError(await logout(url, cookie), 401, 'AUTH_REQUIRED');
  assertError(await me(url, cookie), 401, 'AUTH_REQUIRED');
  assert.equal((await me(url, other.cookie)).status, 200);
});

test('BE-03 쿠키 없이 logout은 401 AUTH_REQUIRED', async (t) => {
  const { url } = await start(t);
  assertError(await logout(url), 401, 'AUTH_REQUIRED');
});

test('BE-03 GET /api/me는 로그인 쿠키로 200 { id, email }만 돌려준다', async (t) => {
  const { url } = await start(t);
  const user = await insertUser(pool);
  const { cookie } = await insertSession(pool, user.id);
  const res = await me(url, cookie);
  assert.equal(res.status, 200);
  assert.deepEqual(Object.keys(res.body).sort(), ['email', 'id']);
  assert.deepEqual(res.body, { id: user.id, email: user.email });
});

test('BE-03 PRD 8장 1일차 오전: 로그인 후 세션 쿠키로 보호 API 호출 성공', async (t) => {
  const { url } = await start(t);
  const user = await insertUser(pool);
  assertError(await me(url), 401, 'AUTH_REQUIRED');
  const loggedIn = await login(url, user.email, user.password);
  assert.equal(loggedIn.status, 200);
  const res = await me(url, sidCookie(loggedIn));
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { id: user.id, email: user.email });
});
