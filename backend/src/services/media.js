import { mediaKeys } from '../aws/storage.js';
import { AppError } from '../errors.js';
import { findActiveCapsuleByMediaId } from '../repositories/capsules.js';
import { hasViewRecord } from '../repositories/viewRecords.js';

export async function getMediaStream({ pool, storage }, { userId, mediaId, variant }) {
  const capsule = await findActiveCapsuleByMediaId(pool, mediaId);
  if (!capsule) throw new AppError('CAPSULE_NOT_FOUND');
  if (variant === 'original' && capsule.user_id !== userId && !(await hasViewRecord(pool, capsule.id, userId))) {
    throw new AppError('MEDIA_FORBIDDEN');
  }
  // 실제 storage는 Promise, 가짜는 Readable을 바로 반환하므로 await로 둘 다 처리
  return await storage.getObjectStream(mediaKeys(mediaId)[variant]);
}
