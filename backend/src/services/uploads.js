import { randomUUID } from 'node:crypto';
import { mediaKeys } from '../aws/storage.js';

// DB 기록 없음. 게시(POST /api/capsules) 때 media_id로 S3 객체를 확인한다
export async function issueUploadUrls({ storage }) {
  const mediaId = randomUUID();
  const keys = mediaKeys(mediaId);
  const original = await storage.createUploadUrl(keys.original);
  const thumb = await storage.createUploadUrl(keys.thumb);
  return { media_id: mediaId, original, thumb };
}
