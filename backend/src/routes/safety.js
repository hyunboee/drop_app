import { Router } from 'express';
import { AppError } from '../errors.js';
import { REPORT_DETAIL_MAX_LENGTH, REPORT_REASONS } from '../params.js';
import { blockOwner, listBlocks, reportCapsule, unblock } from '../services/safety.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function idOf(value) {
  if (!UUID_RE.test(value)) throw new AppError('VALIDATION_FAILED');
  return value;
}

// 신고·차단 (UGC 서비스 필수 기능). /api 아래에 둔다
export function createSafetyRouter(deps) {
  const router = Router();

  router.post('/capsules/:id/report', async (req, res) => {
    const { reason, detail } = req.body ?? {};
    const detailOk = detail === undefined || (typeof detail === 'string' && detail.length <= REPORT_DETAIL_MAX_LENGTH);
    if (!REPORT_REASONS.includes(reason) || !detailOk) throw new AppError('VALIDATION_FAILED');
    await reportCapsule(deps, { userId: req.userId, capsuleId: idOf(req.params.id), reason, detail: detail ?? null });
    res.status(204).end();
  });

  // 이 캡슐을 남긴 사람을 차단한다 (앱은 다른 사람의 ID를 모르므로 캡슐로 가리킨다)
  router.post('/capsules/:id/block-owner', async (req, res) => {
    await blockOwner(deps, { userId: req.userId, capsuleId: idOf(req.params.id) });
    res.status(204).end();
  });

  router.get('/blocks', async (req, res) => {
    res.json({ blocks: await listBlocks(deps, { userId: req.userId }) });
  });

  router.delete('/blocks/:userId', async (req, res) => {
    await unblock(deps, { userId: req.userId, blockedId: idOf(req.params.userId) });
    res.status(204).end();
  });

  return router;
}
