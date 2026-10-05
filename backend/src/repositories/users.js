export async function findUserByEmail(db, email) {
  const { rows } = await db.query(
    'SELECT id, email, password_salt, password_hash FROM users WHERE email = $1',
    [email],
  );
  return rows[0] ?? null;
}

export async function findUserByGoogleSub(db, sub) {
  const { rows } = await db.query('SELECT id, email FROM users WHERE google_sub = $1', [sub]);
  return rows[0] ?? null;
}

// 같은 이메일로 이미 가입한 계정에 구글 계정을 연결한다 (구글이 이메일을 확인해 준 경우만 호출한다)
export async function linkGoogleSub(db, id, sub) {
  await db.query('UPDATE users SET google_sub = $2 WHERE id = $1', [id, sub]);
}

export async function findUserById(db, id) {
  const { rows } = await db.query('SELECT id, email FROM users WHERE id = $1', [id]);
  return rows[0] ?? null;
}

export async function insertUser(db, { email, passwordSalt = null, passwordHash = null, googleSub = null, termsVersion }) {
  const { rows } = await db.query(
    'INSERT INTO users (email, password_salt, password_hash, google_sub, terms_version) VALUES ($1, $2, $3, $4, $5) RETURNING id, email',
    [email, passwordSalt, passwordHash, googleSub, termsVersion],
  );
  return rows[0];
}
