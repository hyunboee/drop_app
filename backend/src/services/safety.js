import { AppError } from '../errors.js';
import { findActiveCapsuleById } from '../repositories/capsules.js';
import { deleteBlock, findBlocks, insertBlock, insertReport } from '../repositories/safety.js';

// 이메일 일부만 보여 준다: hyunboee@gmail.com → h***@gmail.com
export function maskEmail(email) {
  const [name, domain] = email.split('@');
  return `${name[0]}***@${domain}`;
}

async function capsuleOf(pool, userId, capsuleId) {
  const capsule = await findActiveCapsuleById(pool, capsuleId);
  if (!capsule) throw new AppError('CAPSULE_NOT_FOUND');
  if (capsule.user_id === userId) throw new AppError('SELF_TARGET');
  return capsule;
}

export async function reportCapsule({ pool }, { userId, capsuleId, reason, detail }) {
  await capsuleOf(pool, userId, capsuleId);
  await insertReport(pool, { reporterId: userId, capsuleId, reason, detail });
}

export async function blockOwner({ pool }, { userId, capsuleId }) {
  const capsule = await capsuleOf(pool, userId, capsuleId);
  await insertBlock(pool, { blockerId: userId, blockedId: capsule.user_id });
}

export async function unblock({ pool }, { userId, blockedId }) {
  await deleteBlock(pool, { blockerId: userId, blockedId });
}

export async function listBlocks({ pool }, { userId }) {
  const rows = await findBlocks(pool, userId);
  return rows.map((r) => ({ user_id: r.user_id, label: maskEmail(r.email), blocked_at: r.created_at }));
}
