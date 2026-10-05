import { join } from 'node:path';
import express from 'express';
import { AppError, errorBody } from './errors.js';
import { writeLog } from './lib/log.js';
import { requireSession } from './middleware/auth.js';
import { createPublicAuthRouter, createSessionAuthRouter } from './routes/auth.js';
import { createAppUpdateRouter } from './routes/appUpdate.js';
import { createCapsulesRouter } from './routes/capsules.js';
import { createHealthRouter } from './routes/health.js';
import { createMediaRouter } from './routes/media.js';
import { createUploadsRouter } from './routes/uploads.js';

export function createApp({ pool, storage, moderation, ipHashSecret, googleVerify, updatesDir = join(import.meta.dirname, '../updates'), now = Date.now }) {
  const deps = { pool, storage, moderation, ipHashSecret, googleVerify, updatesDir, now };
  const app = express();

  // Cloudflare 한 단계 뒤 (X-Forwarded-For 가장 오른쪽 값)
  app.set('trust proxy', 1);

  app.use((req, res, next) => {
    const start = performance.now();
    const path = req.originalUrl.split('?')[0];
    res.on('finish', () => {
      writeLog({
        level: res.statusCode >= 500 ? 'error' : 'info',
        method: req.method,
        path,
        status: res.statusCode,
        ms: Math.round(performance.now() - start),
        code: res.locals.errorCode,
        email: res.locals.logEmail,
      });
    });
    next();
  });

  app.use(express.json());

  app.use(createHealthRouter(deps));
  app.use('/api/auth', createPublicAuthRouter(deps));
  app.use('/api/app', createAppUpdateRouter(deps));
  app.use('/api', requireSession(deps));
  app.use('/api', createSessionAuthRouter(deps));
  app.use('/api/uploads', createUploadsRouter(deps));
  app.use('/api/capsules', createCapsulesRouter(deps));
  app.use('/api/media', createMediaRouter(deps));

  app.use(express.static(join(import.meta.dirname, '../../frontend/dist')));

  app.use((err, req, res, next) => {
    if (res.headersSent) {
      writeLog({ level: 'error', detail: err.stack });
      res.destroy();
      return;
    }
    let status;
    let body;
    if (err instanceof AppError) {
      status = err.status;
      body = errorBody(err.code, err.extra);
    } else if (err.expose === true && err.status < 500) {
      status = 400;
      body = errorBody('VALIDATION_FAILED');
    } else {
      writeLog({ level: 'error', detail: err.stack });
      status = 500;
      body = errorBody('INTERNAL_ERROR');
    }
    res.locals.errorCode = body.error.code;
    res.status(status).json(body);
  });

  return app;
}
