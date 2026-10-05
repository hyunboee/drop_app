export async function insertReport(db, { reporterId, capsuleId, reason, detail }) {
  // 같은 사람이 같은 캡슐을 다시 신고해도 한 건만 남긴다
  await db.query(
    'INSERT INTO reports (reporter_id, capsule_id, reason, detail) VALUES ($1, $2, $3, $4) ON CONFLICT (reporter_id, capsule_id) DO NOTHING',
    [reporterId, capsuleId, reason, detail],
  );
}

export async function insertBlock(db, { blockerId, blockedId }) {
  await db.query('INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [blockerId, blockedId]);
}

export async function deleteBlock(db, { blockerId, blockedId }) {
  await db.query('DELETE FROM blocks WHERE blocker_id = $1 AND blocked_id = $2', [blockerId, blockedId]);
}

export async function findBlocks(db, blockerId) {
  const { rows } = await db.query(
    `SELECT u.id AS user_id, u.email, b.created_at
     FROM blocks b JOIN users u ON u.id = b.blocked_id
     WHERE b.blocker_id = $1 ORDER BY b.created_at DESC`,
    [blockerId],
  );
  return rows;
}
