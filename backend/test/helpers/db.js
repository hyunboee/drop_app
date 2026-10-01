import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { migrate } from '../../scripts/migrate.js';
import { M_04_SESSION_TTL_SEC, PRM_06_BRONZE_TTL_HOURS, TERMS_VERSION } from '../../src/params.js';
import { createSessionToken, hashPassword } from '../../src/services/auth.js';

export function createTestPool(url = process.env.DATABASE_URL) {
  const dbName = new URL(url).pathname.slice(1);
  if (!dbName.endsWith('_test')) throw new Error(`Test DB name must end with _test: ${dbName}`);
  return new pg.Pool({ connectionString: url });
}

export async function setupTestDb(pool) {
  await migrate(pool);
  await resetDb(pool);
}

export async function resetDb(pool) {
  await pool.query('TRUNCATE users, sessions, capsules, view_records CASCADE');
}

export async function insertUser(pool, { email = `user-${randomUUID()}@example.com`, password = 'password123' } = {}) {
  const { salt, hash } = await hashPassword(password);
  const { rows } = await pool.query(
    'INSERT INTO users (email, password_salt, password_hash, terms_version) VALUES ($1, $2, $3, $4) RETURNING id, email',
    [email, salt, hash, TERMS_VERSION],
  );
  return { ...rows[0], password };
}

export async function insertSession(pool, userId, { expiresAt } = {}) {
  const { token, tokenHash } = createSessionToken();
  await pool.query(
    `INSERT INTO sessions (user_id, token_hash, expires_at)
     VALUES ($1, $2, COALESCE($3::timestamptz, now() + $4 * interval '1 second'))`,
    [userId, tokenHash, expiresAt ?? null, M_04_SESSION_TTL_SEC],
  );
  return { token, cookie: `sid=${token}` };
}

export async function insertCapsule(
  pool,
  { userId, mediaId = randomUUID(), title = '테스트 캡슐', lat = 37.5665, lng = 126.978, status = 'ACTIVE', expiresAt } = {},
) {
  const { rows } = await pool.query(
    `INSERT INTO capsules (user_id, media_id, title, lat, lng, accuracy, heading, status, expires_at)
     VALUES ($1, $2, $3, $4, $5, 5, 0, $6, COALESCE($7::timestamptz, now() + $8 * interval '1 hour'))
     RETURNING id, user_id, media_id, lat, lng, status, expires_at`,
    [userId, mediaId, title, lat, lng, status, expiresAt ?? null, PRM_06_BRONZE_TTL_HOURS],
  );
  return rows[0];
}
