export async function findUserByEmail(db, email) {
  const { rows } = await db.query(
    'SELECT id, email, password_salt, password_hash FROM users WHERE email = $1',
    [email],
  );
  return rows[0] ?? null;
}

export async function findUserById(db, id) {
  const { rows } = await db.query('SELECT id, email FROM users WHERE id = $1', [id]);
  return rows[0] ?? null;
}

export async function insertUser(db, { email, passwordSalt, passwordHash, termsVersion }) {
  const { rows } = await db.query(
    'INSERT INTO users (email, password_salt, password_hash, terms_version) VALUES ($1, $2, $3, $4) RETURNING id, email',
    [email, passwordSalt, passwordHash, termsVersion],
  );
  return rows[0];
}
