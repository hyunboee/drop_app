import { Router } from 'express';

export function createHealthRouter({ pool }) {
  const router = Router();
  router.get('/api/health', async (req, res) => {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  });
  return router;
}
