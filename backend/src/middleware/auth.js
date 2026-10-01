import { AppError } from '../errors.js';
import { findActiveSession } from '../repositories/sessions.js';
import { hashToken } from '../services/auth.js';

export function requireSession({ pool }) {
  return async (req, res, next) => {
    const sid = (req.headers.cookie ?? '')
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
