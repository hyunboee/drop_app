export async function insertViewRecord(db, { capsuleId, userId, lat, lng, accuracy, ipHash }) {
  await db.query(
    'INSERT INTO view_records (capsule_id, user_id, lat, lng, accuracy, ip_hash) VALUES ($1, $2, $3, $4, $5, $6)',
    [capsuleId, userId, lat, lng, accuracy, ipHash],
  );
}

export async function hasViewRecord(db, capsuleId, userId) {
  const { rows } = await db.query(
    'SELECT EXISTS (SELECT 1 FROM view_records WHERE capsule_id = $1 AND user_id = $2) AS ok',
    [capsuleId, userId],
  );
  return rows[0].ok;
}
