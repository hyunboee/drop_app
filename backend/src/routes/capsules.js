import { Router } from 'express';
import { AppError } from '../errors.js';
import { M_11_TITLE_MAX_LENGTH, M_11_TITLE_MIN_LENGTH } from '../params.js';
import { deleteCapsule, findNearby, openCapsule, publishCapsule } from '../services/capsules.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isLat = (v) => isNum(v) && v >= -90 && v <= 90;
const isLng = (v) => isNum(v) && v >= -180 && v <= 180;
const isAccuracy = (v) => isNum(v) && v >= 0;
const isHeading = (v) => isNum(v) && v >= 0 && v < 360;

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
    const { media_id, title, grade, lat, lng, accuracy, heading, user_lat, user_lng } = bodyOf(req);
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
      typeof grade !== 'string'
    ) {
      throw new AppError('VALIDATION_FAILED');
    }
    if (grade !== 'BRONZE') throw new AppError('GRADE_NOT_ALLOWED');
    const { created, capsule } = await publishCapsule(deps, {
      userId: req.userId, mediaId: media_id, title, grade, lat, lng, accuracy, heading, userLat: user_lat, userLng: user_lng,
    });
    res.status(created ? 201 : 200).json({ id: capsule.id, expires_at: capsule.expires_at });
  });

  router.get('/nearby', async (req, res) => {
    const lat = queryCoord(req.query.lat, isLat);
    const lng = queryCoord(req.query.lng, isLng);
    res.json({ capsules: await findNearby(deps, { userId: req.userId, lat, lng }) });
  });

  router.post('/:id/open', async (req, res) => {
    const capsuleId = capsuleIdOf(req);
    const { lat, lng, accuracy } = bodyOf(req);
    if (!isLat(lat) || !isLng(lng) || !isAccuracy(accuracy)) throw new AppError('VALIDATION_FAILED');
    res.json(await openCapsule(deps, { userId: req.userId, capsuleId, lat, lng, accuracy, ip: req.ip }));
  });

  router.delete('/:id', async (req, res) => {
    await deleteCapsule(deps, { userId: req.userId, capsuleId: capsuleIdOf(req) });
    res.status(204).end();
  });

  return router;
}
