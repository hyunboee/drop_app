// "Active" = status = 'ACTIVE' AND expires_at > now()

export async function findCapsuleByMediaId(db, mediaId) {
  const { rows } = await db.query('SELECT id, user_id, expires_at FROM capsules WHERE media_id = $1', [mediaId]);
  return rows[0] ?? null;
}

// published_at 기본값 now()와 같은 문장의 now()라 차이가 정확히 ttlHours
export async function insertCapsule(db, { userId, mediaId, title, grade, lat, lng, accuracy, heading, ttlHours }) {
  const { rows } = await db.query(
    `INSERT INTO capsules (user_id, media_id, title, grade, lat, lng, accuracy, heading, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now() + $9 * interval '1 hour')
     RETURNING id, expires_at`,
    [userId, mediaId, title, grade, lat, lng, accuracy, heading, ttlHours],
  );
  return rows[0];
}

export async function findNearbyCapsules(db, { box, center, radiusM, earthRadiusM, userId }) {
  const { rows } = await db.query(
    `SELECT id, title, lat, lng, heading, media_id, user_id = $9 AS is_mine
     FROM capsules
     WHERE lat BETWEEN $1 AND $2 AND lng BETWEEN $3 AND $4
       AND status = 'ACTIVE' AND expires_at > now()
       AND 2 * $5::double precision * asin(least(1, sqrt(
             power(sin(radians(lat - $6) / 2), 2)
             + cos(radians($6)) * cos(radians(lat)) * power(sin(radians(lng - $7) / 2), 2)
           ))) <= $8`,
    [box.minLat, box.maxLat, box.minLng, box.maxLng, earthRadiusM, center.lat, center.lng, radiusM, userId],
  );
  return rows;
}

export async function findActiveCapsuleById(db, id) {
  const { rows } = await db.query(
    "SELECT id, user_id, media_id, lat, lng FROM capsules WHERE id = $1 AND status = 'ACTIVE' AND expires_at > now()",
    [id],
  );
  return rows[0] ?? null;
}

export async function findActiveCapsuleByMediaId(db, mediaId) {
  const { rows } = await db.query(
    "SELECT id, user_id FROM capsules WHERE media_id = $1 AND status = 'ACTIVE' AND expires_at > now()",
    [mediaId],
  );
  return rows[0] ?? null;
}

export async function markCapsuleDeleted(db, id) {
  await db.query("UPDATE capsules SET status = 'DELETED' WHERE id = $1", [id]);
}
