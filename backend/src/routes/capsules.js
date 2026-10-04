import { Router } from 'express';
import { AppError } from '../errors.js';
import { M_11_TITLE_MAX_LENGTH, M_11_TITLE_MIN_LENGTH, XP_01_SIZE_M_MAX, XP_01_SIZE_M_MIN, XP_02_SIZE_M_DEFAULT } from '../params.js';
import { deleteCapsule, findNearby, listArchive, listMine, openCapsule, publishCapsule, updateLook } from '../services/capsules.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isLat = (v) => isNum(v) && v >= -90 && v <= 90;
const isLng = (v) => isNum(v) && v >= -180 && v <= 180;
const isAccuracy = (v) => isNum(v) && v >= 0;
const isHeading = (v) => isNum(v) && v >= 0 && v < 360;
const isSizeM = (v) => isNum(v) && v >= XP_01_SIZE_M_MIN && v <= XP_01_SIZE_M_MAX;
// ARCore 클라우드 앵커 ID: 서버는 내용을 검증하지 않고 형식만 본다 (네이티브 PRD RISK-N06)
const isAnchorId = (v) => typeof v === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(v);

function bodyOf(req) {
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AppError('VALIDATION_FAILED');
  return body;
}

function capsuleIdOf(req) {
  if (!UUID_RE.test(req.params.id)) throw new AppError('VALIDATION_FAILED');
  return req.params.id;
}

function queryCoord(v, isValid) {
  if (typeof v !== 'string' || v.trim() === '') throw new AppError('VALIDATION_FAILED');
  const n = Number(v);
  if (!isValid(n)) throw new AppError('VALIDATION_FAILED');
  return n;
}

export function createCapsulesRouter(deps) {
  const router = Router();

  router.post('/', async (req, res) => {
    const { media_id, title, grade, lat, lng, accuracy, heading, user_lat, user_lng, cloud_anchor_id, size_m } = bodyOf(req);
    const titleLength = typeof title === 'string' ? [...title].length : -1;
    if (
      typeof media_id !== 'string' ||
      !UUID_RE.test(media_id) ||
      titleLength < M_11_TITLE_MIN_LENGTH ||
      titleLength > M_11_TITLE_MAX_LENGTH ||
      !isLat(lat) ||
      !isLng(lng) ||
      !isLat(user_lat) ||
      !isLng(user_lng) ||
      !isAccuracy(accuracy) ||
      !isHeading(heading) ||
      typeof grade !== 'string' ||
      (cloud_anchor_id !== undefined && !isAnchorId(cloud_anchor_id)) ||
      (size_m !== undefined && !isSizeM(size_m))
    ) {
      throw new AppError('VALIDATION_FAILED');
    }
    if (grade !== 'BRONZE' && grade !== 'SILVER') throw new AppError('GRADE_NOT_ALLOWED');
    const { created, capsule } = await publishCapsule(deps, {
      userId: req.userId, mediaId: media_id, title, grade, lat, lng, accuracy, heading, userLat: user_lat, userLng: user_lng,
      cloudAnchorId: cloud_anchor_id ?? null, sizeM: size_m ?? XP_02_SIZE_M_DEFAULT,
    });
    res.status(created ? 201 : 200).json({ id: capsule.id, expires_at: capsule.expires_at });
  });

  router.get('/nearby', async (req, res) => {
    const lat = queryCoord(req.query.lat, isLat);
    const lng = queryCoord(req.query.lng, isLng);
    res.json({ capsules: await findNearby(deps, { userId: req.userId, lat, lng }) });
  });

  router.get('/mine', async (req, res) => {
    res.json({ capsules: await listMine(deps, { userId: req.userId }) });
  });

  router.get('/archive', async (req, res) => {
    res.json({ capsules: await listArchive(deps, { userId: req.userId }) });
  });

  router.post('/:id/open', async (req, res) => {
    const capsuleId = capsuleIdOf(req);
    const { lat, lng, accuracy } = bodyOf(req);
    if (!isLat(lat) || !isLng(lng) || !isAccuracy(accuracy)) throw new AppError('VALIDATION_FAILED');
    res.json(await openCapsule(deps, { userId: req.userId, capsuleId, lat, lng, accuracy, ip: req.ip }));
  });

  // 주인이 크기(size_m)·방향(heading)만 다시 정한다. 위치는 바꿀 수 없다
  router.patch('/:id', async (req, res) => {
    const { size_m, heading, ...rest } = bodyOf(req);
    const noChange = size_m === undefined && heading === undefined;
    if (
      noChange ||
      Object.keys(rest).length > 0 ||
      (size_m !== undefined && !isSizeM(size_m)) ||
      (heading !== undefined && !isHeading(heading))
    ) {
      throw new AppError('VALIDATION_FAILED');
    }
    await updateLook(deps, { userId: req.userId, capsuleId: capsuleIdOf(req), sizeM: size_m, heading });
    res.status(204).end();
  });

  router.delete('/:id', async (req, res) => {
    await deleteCapsule(deps, { userId: req.userId, capsuleId: capsuleIdOf(req) });
    res.status(204).end();
  });

  return router;
}
