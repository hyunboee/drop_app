import { AppError } from '../errors.js';
import { findActiveSession } from '../repositories/sessions.js';
import { hashToken } from '../services/auth.js';

export function requireSession({ pool }) {
  return async (req, res, next) => {
    // 앱은 Authorization: Bearer로, 웹은 쿠키로 같은 세션 토큰을 보낸다. 헤더가 있으면 헤더만 본다 (BE-14)
    const auth = req.headers.authorization;
    const sid =
      auth !== undefined
        ? /^Bearer (\S+)$/.exec(auth)?.[1]
        : (req.headers.cookie ?? '')
            .split(';')
            .map((part) => part.trim())
            .find((part) => part.startsWith('sid='))
            ?.slice('sid='.length);
    if (!sid) throw new AppError('AUTH_REQUIRED');
    const session = await findActiveSession(pool, hashToken(sid));
    if (!session) throw new AppError('AUTH_REQUIRED');
    req.userId = session.user_id;
    req.sessionId = session.id;
    next();
  };
}
