import { createHash, randomBytes, scrypt, scryptSync, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { withTransaction } from '../db.js';
import { AppError } from '../errors.js';
import { M_04_SESSION_TTL_SEC, M_05_LOGIN_LOCK_MS, M_05_LOGIN_MAX_FAILURES, TERMS_VERSION } from '../params.js';
import { findUserByEmail, findUserByGoogleSub, findUserById, insertUser, linkGoogleSub } from '../repositories/users.js';
import { deleteExpiredSessions, deleteSession, insertSession } from '../repositories/sessions.js';

const scryptAsync = promisify(scrypt);
const KEY_LEN = 64;
// 미가입 이메일 로그인에도 같은 scrypt 비용을 써서 응답 시간으로 가입 여부를 드러내지 않는다 (FR-01)
const DUMMY_SALT = randomBytes(16).toString('hex');
const DUMMY_HASH = scryptSync('dummy-password', DUMMY_SALT, KEY_LEN).toString('hex');

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = (await scryptAsync(password, salt, KEY_LEN)).toString('hex');
  return { salt, hash };
}

export async function verifyPassword(password, salt, hash) {
  const actual = await scryptAsync(password, salt, KEY_LEN);
  return timingSafeEqual(actual, Buffer.from(hash, 'hex'));
}

export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

export function createSessionToken() {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashToken(token) };
}

// ponytail: 단일 인스턴스 메모리 카운터라 재시작 시 초기화된다, 인스턴스가 늘면 DB 테이블로 옮긴다
// 키: 소문자 이메일(가입 여부 무관), 값: { count, lockedUntil }
const loginFailures = new Map();

export function isLocked(email, nowMs) {
  const entry = loginFailures.get(email);
  if (!entry?.lockedUntil) return false;
  if (nowMs >= entry.lockedUntil) {
    loginFailures.delete(email);
    return false;
  }
  return true;
}

export function recordLoginFailure(email, nowMs) {
  const entry = loginFailures.get(email) ?? { count: 0, lockedUntil: null };
  entry.count += 1;
  if (entry.count >= M_05_LOGIN_MAX_FAILURES) entry.lockedUntil = nowMs + M_05_LOGIN_LOCK_MS;
  loginFailures.set(email, entry);
}

export function clearLoginFailures(email) {
  loginFailures.delete(email);
}

export async function signup({ pool }, { email, password }) {
  const normalized = email.toLowerCase();
  const { salt, hash } = await hashPassword(password);
  const { token, tokenHash } = createSessionToken();
  try {
    const user = await withTransaction(pool, async (client) => {
      const created = await insertUser(client, {
        email: normalized,
        passwordSalt: salt,
        passwordHash: hash,
        termsVersion: TERMS_VERSION,
      });
      await insertSession(client, { userId: created.id, tokenHash, ttlSec: M_04_SESSION_TTL_SEC });
      return created;
    });
    return { user, token };
  } catch (err) {
    if (err.code === '23505') throw new AppError('EMAIL_TAKEN');
    throw err;
  }
}

export async function login({ pool, now }, { email, password }) {
  const normalized = email.toLowerCase();
  if (isLocked(normalized, now())) throw new AppError('ACCOUNT_LOCKED');
  const found = await findUserByEmail(pool, normalized);
  // 구글로만 가입한 계정(비밀번호 없음)은 비밀번호 로그인이 안 된다
  const valid = found?.password_hash
    ? await verifyPassword(password, found.password_salt, found.password_hash)
    : (await verifyPassword(password, DUMMY_SALT, DUMMY_HASH), false);
  if (!valid) {
    recordLoginFailure(normalized, now());
    throw new AppError('INVALID_CREDENTIALS');
  }
  clearLoginFailures(normalized);
  const { token, tokenHash } = createSessionToken();
  await withTransaction(pool, async (client) => {
    await deleteExpiredSessions(client, found.id);
    await insertSession(client, { userId: found.id, tokenHash, ttlSec: M_04_SESSION_TTL_SEC });
  });
  return { user: { id: found.id, email: found.email }, token };
}

// 구글 로그인: 이미 연결된 계정이면 로그인, 같은 이메일로 가입한 계정이 있으면 연결(구글이 이메일을 확인한 값만 믿는다),
// 없으면 새로 가입한다. 새로 가입할 때는 약관 동의 3개가 있어야 한다
export async function googleLogin({ pool, googleVerify }, { idToken, consents }) {
  if (!googleVerify) throw new AppError('GOOGLE_AUTH_FAILED');
  const claims = await googleVerify(idToken);
  const { token, tokenHash } = createSessionToken();
  return withTransaction(pool, async (client) => {
    let created = false;
    let user = await findUserByGoogleSub(client, claims.sub);
    if (!user) {
      user = await findUserByEmail(client, claims.email);
      if (user) {
        await linkGoogleSub(client, user.id, claims.sub);
      } else {
        if (!consents) throw new AppError('CONSENT_REQUIRED');
        user = await insertUser(client, { email: claims.email, googleSub: claims.sub, termsVersion: TERMS_VERSION });
        created = true;
      }
    }
    await deleteExpiredSessions(client, user.id);
    await insertSession(client, { userId: user.id, tokenHash, ttlSec: M_04_SESSION_TTL_SEC });
    return { user: { id: user.id, email: user.email }, token, created };
  });
}

export async function logout({ pool }, sessionId) {
  await deleteSession(pool, sessionId);
}

export async function getMe({ pool }, userId) {
  return findUserById(pool, userId);
}
