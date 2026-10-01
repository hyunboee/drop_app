import { Router } from 'express';
import { issueUploadUrls } from '../services/uploads.js';

export function createUploadsRouter(deps) {
  const router = Router();

  router.post('/', async (req, res) => {
    res.json(await issueUploadUrls(deps));
  });

  return router;
}
