// "Active" = status = 'ACTIVE' AND expires_at > now()

export async function findCapsuleByMediaId(db, mediaId) {
  const { rows } = await db.query('SELECT id, user_id, expires_at FROM capsules WHERE media_id = $1', [mediaId]);
  return rows[0] ?? null;
}

// published_at 기본값 now()와 같은 문장의 now()라 차이가 정확히 ttlHours
export async function insertCapsule(db, { userId, mediaId, title, grade, lat, lng, accuracy, heading, cloudAnchorId, sizeM, ttlHours }) {
  const { rows } = await db.query(
    `INSERT INTO capsules (user_id, media_id, title, grade, lat, lng, accuracy, heading, cloud_anchor_id, size_m, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $10, $11, now() + $9 * interval '1 hour')
     RETURNING id, expires_at`,
    [userId, mediaId, title, grade, lat, lng, accuracy, heading, ttlHours, cloudAnchorId, sizeM],
  );
  return rows[0];
}

export async function findNearbyCapsules(db, { box, center, radiusM, earthRadiusM, userId }) {
  const { rows } = await db.query(
    `SELECT id, title, grade, lat, lng, heading, media_id, cloud_anchor_id, size_m, user_id = $9 AS is_mine
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

// 내가 남긴 Active 캡슐. view_count는 다른 사람이 연 횟수 (BE-19)
export async function findMyCapsules(db, userId) {
  const { rows } = await db.query(
    `SELECT id, title, grade, media_id, lat, lng, expires_at,
            (SELECT count(*)::int FROM view_records v WHERE v.capsule_id = capsules.id AND v.user_id <> $1) AS view_count
     FROM capsules
     WHERE user_id = $1 AND status = 'ACTIVE' AND expires_at > now()
     ORDER BY published_at DESC`,
    [userId],
  );
  return rows;
}

// 내가 연 Active 캡슐(보관함). 같은 캡슐을 여러 번 열어도 한 번만 나온다 (BE-19)
export async function findOpenedCapsules(db, userId) {
  const { rows } = await db.query(
    `SELECT c.id, c.title, c.media_id, max(v.viewed_at) AS opened_at
     FROM view_records v JOIN capsules c ON c.id = v.capsule_id
     WHERE v.user_id = $1 AND c.status = 'ACTIVE' AND c.expires_at > now()
     GROUP BY c.id
     ORDER BY opened_at DESC`,
    [userId],
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

// 주인이 크기·방향만 다시 정한다. 위치(lat, lng)와 앵커는 바꾸지 않는다. 보낸 값만 바꾼다
export async function updateCapsuleLook(db, id, { sizeM, heading }) {
  await db.query('UPDATE capsules SET size_m = COALESCE($2, size_m), heading = COALESCE($3, heading) WHERE id = $1', [id, sizeM, heading]);
}

export async function markCapsuleDeleted(db, id) {
  await db.query("UPDATE capsules SET status = 'DELETED' WHERE id = $1", [id]);
}
