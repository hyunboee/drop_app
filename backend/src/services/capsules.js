import { createHmac } from 'node:crypto';
import { mediaKeys } from '../aws/storage.js';
import { AppError } from '../errors.js';
import { boundingBox, distanceM, EARTH_RADIUS_M, isLowAccuracy, judgeOpen } from '../lib/geo.js';
import { M_01_NEARBY_RADIUS_M, M_06_PHOTO_MAX_BYTES, PRM_06_BRONZE_TTL_HOURS, PRM_06_SILVER_TTL_HOURS, PRM_20_DROP_PLACE_RADIUS_M } from '../params.js';
import {
  findActiveCapsuleById,
  findCapsuleByMediaId,
  findMyCapsules,
  findNearbyCapsules,
  findOpenedCapsules,
  insertCapsule,
  isHiddenFrom,
  markCapsuleDeleted,
  updateCapsuleLook,
} from '../repositories/capsules.js';
import { insertViewRecord } from '../repositories/viewRecords.js';

export function hashIp(secret, ip) {
  return createHmac('sha256', secret).update(ip).digest('hex');
}

function existingResult(existing, userId) {
  if (existing.user_id !== userId) throw new AppError('MEDIA_ALREADY_USED');
  return { created: false, capsule: { id: existing.id, expires_at: existing.expires_at } };
}

// 등급별 보관 시간(시간). 다이아는 null(평생: 만료 시각 'infinity')
export function ttlHoursOf(grade) {
  if (grade === 'DIAMOND') return null;
  return grade === 'SILVER' ? PRM_06_SILVER_TTL_HOURS : PRM_06_BRONZE_TTL_HOURS;
}

export async function publishCapsule(
  { pool, storage, moderation },
  { userId, mediaId, title, grade, lat, lng, accuracy, heading, userLat, userLng, cloudAnchorId, sizeM },
) {
  const existing = await findCapsuleByMediaId(pool, mediaId);
  if (existing) return existingResult(existing, userId);

  if (isLowAccuracy(accuracy)) throw new AppError('LOW_ACCURACY');
  // 사용자 좌표는 배치 거리 검증에만 쓰고 저장하지 않는다 (PRM-20)
  if (distanceM({ lat: userLat, lng: userLng }, { lat, lng }) > PRM_20_DROP_PLACE_RADIUS_M) throw new AppError('DROP_TOO_FAR');

  const keys = mediaKeys(mediaId);
  for (const key of [keys.original, keys.thumb]) {
    const head = await storage.headObject(key);
    if (!head || head.contentType !== 'image/jpeg' || head.contentLength > M_06_PHOTO_MAX_BYTES) {
      throw new AppError('VALIDATION_FAILED');
    }
  }

  // ponytail: 순차 검열이라 최악 2 × M-09, NFR 위반이 확인되면 Promise.all
  for (const key of [keys.original, keys.thumb]) {
    const result = await moderation.moderate(key);
    if (result.rejected) {
      await storage.deleteObjects([keys.original, keys.thumb]);
      throw new AppError('MODERATION_REJECTED', { labels: result.labels });
    }
  }

  await storage.removePendingTag(keys.original);
  await storage.removePendingTag(keys.thumb);

  try {
    const capsule = await insertCapsule(pool, {
      userId, mediaId, title, grade, lat, lng, accuracy, heading, cloudAnchorId, sizeM, ttlHours: ttlHoursOf(grade),
    });
    return { created: true, capsule };
  } catch (err) {
    if (err.code !== '23505') throw err;
    return existingResult(await findCapsuleByMediaId(pool, mediaId), userId);
  }
}

export async function findNearby({ pool }, { userId, lat, lng }) {
  const center = { lat, lng };
  const rows = await findNearbyCapsules(pool, {
    box: boundingBox(center, M_01_NEARBY_RADIUS_M),
    center,
    radiusM: M_01_NEARBY_RADIUS_M,
    earthRadiusM: EARTH_RADIUS_M,
    userId,
  });
  return rows.map(({ id, title, grade, lat, lng, heading, media_id, is_mine, cloud_anchor_id, size_m }) => ({
    id, title, grade, lat, lng, heading, thumb_url: `/api/media/${media_id}/thumb`, is_mine, cloud_anchor_id, size_m,
  }));
}

// 홈 화면(NW-16): 내가 남긴 캡슐
export async function listMine({ pool }, { userId }) {
  const rows = await findMyCapsules(pool, userId);
  return rows.map(({ id, title, grade, media_id, lat, lng, expires_at, view_count }) => ({
    id, title, grade, thumb_url: `/api/media/${media_id}/thumb`, lat, lng, expires_at, view_count,
  }));
}

// 보관함(NW-17): 내가 연 캡슐. 원본은 열람 기록이 있어 미디어 프록시가 내려준다
export async function listArchive({ pool }, { userId }) {
  const rows = await findOpenedCapsules(pool, userId);
  return rows.map(({ id, title, media_id, opened_at }) => ({
    id, title, thumb_url: `/api/media/${media_id}/thumb`, media_url: `/api/media/${media_id}`, opened_at,
  }));
}

// MVP 단순화(Q-11): 평면 일치·이동 속도·무결성·유효 시간 생략
export async function openCapsule({ pool, ipHashSecret }, { userId, capsuleId, lat, lng, accuracy, ip }) {
  const capsule = await findActiveCapsuleById(pool, capsuleId);
  if (!capsule || (await isHiddenFrom(pool, capsuleId, userId))) throw new AppError('CAPSULE_NOT_FOUND');
  if (isLowAccuracy(accuracy)) throw new AppError('LOW_ACCURACY');
  const { allowed, remainingM } = judgeOpen(distanceM({ lat, lng }, capsule), accuracy);
  if (!allowed) throw new AppError('OUT_OF_RANGE', { remaining_m: remainingM });
  await insertViewRecord(pool, { capsuleId, userId, lat, lng, accuracy, ipHash: hashIp(ipHashSecret, ip) });
  return { media_url: `/api/media/${capsule.media_id}` };
}

// 크기·방향 다시 정하기. 주인만 가능하고 위치는 바꿀 수 없다
export async function updateLook({ pool }, { userId, capsuleId, sizeM, heading }) {
  const capsule = await findActiveCapsuleById(pool, capsuleId);
  if (!capsule) throw new AppError('CAPSULE_NOT_FOUND');
  if (capsule.user_id !== userId) throw new AppError('NOT_OWNER');
  await updateCapsuleLook(pool, capsuleId, { sizeM: sizeM ?? null, heading: heading ?? null });
}

export async function deleteCapsule({ pool, storage }, { userId, capsuleId }) {
  const capsule = await findActiveCapsuleById(pool, capsuleId);
  if (!capsule) throw new AppError('CAPSULE_NOT_FOUND');
  if (capsule.user_id !== userId) throw new AppError('NOT_OWNER');
  await markCapsuleDeleted(pool, capsuleId);
  const keys = mediaKeys(capsule.media_id);
  await storage.deleteObjects([keys.original, keys.thumb]);
}
