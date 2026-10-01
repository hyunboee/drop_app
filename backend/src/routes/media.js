import { pipeline } from 'node:stream/promises';
import { Router } from 'express';
import { AppError } from '../errors.js';
import { getMediaStream } from '../services/media.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createMediaRouter(deps) {
  const router = Router();

  const send = (variant) => async (req, res) => {
    const { mediaId } = req.params;
    if (!UUID_RE.test(mediaId)) throw new AppError('CAPSULE_NOT_FOUND');
    const stream = await getMediaStream(deps, { userId: req.userId, mediaId, variant });
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    await pipeline(stream, res);
  };

  router.get('/:mediaId', send('original'));
  router.get('/:mediaId/thumb', send('thumb'));

  return router;
}
