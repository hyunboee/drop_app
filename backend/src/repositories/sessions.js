export async function insertSession(db, { userId, tokenHash, ttlSec }) {
  await db.query(
    "INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, now() + $3 * interval '1 second')",
    [userId, tokenHash, ttlSec],
  );
}

export async function findActiveSession(db, tokenHash) {
  const { rows } = await db.query(
    'SELECT id, user_id FROM sessions WHERE token_hash = $1 AND expires_at > now()',
    [tokenHash],
  );
  return rows[0] ?? null;
}

export async function deleteSession(db, id) {
  await db.query('DELETE FROM sessions WHERE id = $1', [id]);
}

export async function deleteExpiredSessions(db, userId) {
  await db.query('DELETE FROM sessions WHERE user_id = $1 AND expires_at < now()', [userId]);
}
