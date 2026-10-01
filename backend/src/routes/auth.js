import { Router } from 'express';
import { AppError } from '../errors.js';
import { M_04_SESSION_TTL_SEC, M_10_PASSWORD_MIN_LENGTH } from '../params.js';
import { getMe, login, logout, signup } from '../services/auth.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COOKIE_ATTRS = 'HttpOnly; Secure; SameSite=Strict; Path=/';

function setSessionCookie(res, token) {
  res.setHeader('Set-Cookie', `sid=${token}; ${COOKIE_ATTRS}; Max-Age=${M_04_SESSION_TTL_SEC}`);
}

function bodyOf(req) {
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AppError('VALIDATION_FAILED');
  return body;
}

export function createPublicAuthRouter(deps) {
  const router = Router();

  router.post('/signup', async (req, res) => {
    const { email, password, agree_terms, agree_location, agree_age } = bodyOf(req);
    if (
      typeof email !== 'string' ||
      !EMAIL_RE.test(email) ||
      typeof password !== 'string' ||
      password.length < M_10_PASSWORD_MIN_LENGTH ||
      agree_terms !== true ||
      agree_location !== true ||
      agree_age !== true
    ) {
      throw new AppError('VALIDATION_FAILED');
    }
    res.locals.logEmail = email;
    const { user, token } = await signup(deps, { email, password });
    setSessionCookie(res, token);
    res.status(201).json({ id: user.id, email: user.email });
  });

  router.post('/login', async (req, res) => {
    const { email, password } = bodyOf(req);
    if (typeof email !== 'string' || email === '' || typeof password !== 'string' || password === '') {
      throw new AppError('VALIDATION_FAILED');
    }
    res.locals.logEmail = email;
    const { user, token } = await login(deps, { email, password });
    setSessionCookie(res, token);
    res.json({ id: user.id, email: user.email });
  });

  return router;
}

export function createSessionAuthRouter(deps) {
  const router = Router();

  router.post('/auth/logout', async (req, res) => {
    await logout(deps, req.sessionId);
    res.setHeader('Set-Cookie', `sid=; ${COOKIE_ATTRS}; Max-Age=0`);
    res.status(204).end();
  });

  router.get('/me', async (req, res) => {
    const { id, email } = await getMe(deps, req.userId);
    res.json({ id, email });
  });

  return router;
}
