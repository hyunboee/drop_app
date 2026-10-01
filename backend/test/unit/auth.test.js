import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  hashPassword,
  verifyPassword,
  hashToken,
  createSessionToken,
  isLocked,
  recordLoginFailure,
  clearLoginFailures,
} from '../../src/services/auth.js';
import { M_05_LOGIN_MAX_FAILURES, M_05_LOGIN_LOCK_MS } from '../../src/params.js';

// 잠금 Map은 모듈 메모리라 테스트마다 다른 이메일을 쓴다
const email = () => `lock-${randomUUID()}@example.com`;

function fail(e, nowMs, times) {
  for (let i = 0; i < times; i++) recordLoginFailure(e, nowMs);
}

test('BE-02 hashPassword는 16바이트 hex salt와 64바이트 hex 해시를 만들고 평문과 다르다', async () => {
  const { salt, hash } = await hashPassword('password123');
  assert.match(salt, /^[0-9a-f]{32}$/);
  assert.match(hash, /^[0-9a-f]{128}$/);
  assert.notEqual(hash, 'password123');
});

test('BE-02 hashPassword는 같은 비밀번호도 호출마다 다른 salt·해시를 만든다', async () => {
  const a = await hashPassword('password123');
  const b = await hashPassword('password123');
  assert.notEqual(a.salt, b.salt);
  assert.notEqual(a.hash, b.hash);
});

test('BE-02 verifyPassword는 맞는 비밀번호 true, 틀린 비밀번호 false', async () => {
  const { salt, hash } = await hashPassword('password123');
  assert.equal(await verifyPassword('password123', salt, hash), true);
  assert.equal(await verifyPassword('password124', salt, hash), false);
  assert.equal(await verifyPassword('', salt, hash), false);
});

test('BE-02 verifyPassword는 다른 salt로는 false', async () => {
  const { hash } = await hashPassword('password123');
  const other = await hashPassword('password123');
  assert.equal(await verifyPassword('password123', other.salt, hash), false);
});

test('BE-02 hashToken은 SHA-256 hex', () => {
  assert.equal(hashToken('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('BE-02 createSessionToken은 32바이트 base64url 토큰과 그 해시를 돌려준다', () => {
  const { token, tokenHash } = createSessionToken();
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(tokenHash, hashToken(token));
  assert.notEqual(tokenHash, token);
  assert.notEqual(createSessionToken().token, token);
});

test('BE-02 M-05 4회 실패는 잠기지 않는다', () => {
  const e = email();
  const t = 1_000_000;
  assert.equal(isLocked(e, t), false);
  fail(e, t, M_05_LOGIN_MAX_FAILURES - 1);
  assert.equal(isLocked(e, t), false);
});

test('BE-02 M-05 5회 실패 시 잠기고 lockedUntil - 1ms까지 잠금, M-05 경과 시 해제', () => {
  const e = email();
  const t = 1_000_000;
  fail(e, t, M_05_LOGIN_MAX_FAILURES);
  assert.equal(isLocked(e, t), true);
  assert.equal(isLocked(e, t + M_05_LOGIN_LOCK_MS - 1), true);
  assert.equal(isLocked(e, t + M_05_LOGIN_LOCK_MS), false);
});

test('BE-02 잠금 해제 후에는 실패 횟수가 처음부터 다시 센다', () => {
  const e = email();
  const t = 1_000_000;
  fail(e, t, M_05_LOGIN_MAX_FAILURES);
  const after = t + M_05_LOGIN_LOCK_MS;
  assert.equal(isLocked(e, after), false);
  fail(e, after, M_05_LOGIN_MAX_FAILURES - 1);
  assert.equal(isLocked(e, after), false);
  recordLoginFailure(e, after);
  assert.equal(isLocked(e, after), true);
});

test('BE-02 clearLoginFailures는 실패 횟수를 초기화한다', () => {
  const e = email();
  const t = 1_000_000;
  fail(e, t, M_05_LOGIN_MAX_FAILURES - 1);
  clearLoginFailures(e);
  fail(e, t, M_05_LOGIN_MAX_FAILURES - 1);
  assert.equal(isLocked(e, t), false);
});

test('BE-02 잠금은 이메일별로 따로 센다', () => {
  const a = email();
  const b = email();
  const t = 1_000_000;
  fail(a, t, M_05_LOGIN_MAX_FAILURES);
  assert.equal(isLocked(a, t), true);
  assert.equal(isLocked(b, t), false);
});
