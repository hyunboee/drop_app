import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ERRORS, AppError, errorBody } from '../../src/errors.js';

const EXPECTED_STATUS = {
  AUTH_REQUIRED: 401, INVALID_CREDENTIALS: 401, ACCOUNT_LOCKED: 429, EMAIL_TAKEN: 409,
  VALIDATION_FAILED: 400, GRADE_NOT_ALLOWED: 400, LOW_ACCURACY: 422, DROP_TOO_FAR: 422, OUT_OF_RANGE: 403,
  MODERATION_REJECTED: 422, MODERATION_UNAVAILABLE: 503, MEDIA_ALREADY_USED: 409,
  NOT_OWNER: 403, MEDIA_FORBIDDEN: 403, CAPSULE_NOT_FOUND: 404, INTERNAL_ERROR: 500,
};

test('BE-01 에러 코드표 전체가 코드 → HTTP 상태로 매핑된다', () => {
  assert.deepEqual(Object.keys(ERRORS).sort(), Object.keys(EXPECTED_STATUS).sort());
  for (const [code, status] of Object.entries(EXPECTED_STATUS)) {
    assert.equal(ERRORS[code].status, status, code);
    assert.ok(ERRORS[code].message.length > 0, code);
  }
});

test('BE-01 AppError는 code·status·message·extra를 가진다', () => {
  const err = new AppError('OUT_OF_RANGE', { remaining_m: 3.2 });
  assert.ok(err instanceof Error);
  assert.equal(err.code, 'OUT_OF_RANGE');
  assert.equal(err.status, 403);
  assert.equal(err.message, ERRORS.OUT_OF_RANGE.message);
  assert.deepEqual(err.extra, { remaining_m: 3.2 });
  assert.deepEqual(new AppError('AUTH_REQUIRED').extra, {});
});

test('BE-01 errorBody는 { error: { code, message, ...extra } } 형식', () => {
  assert.deepEqual(errorBody('MODERATION_REJECTED', { labels: ['Explicit'] }), {
    error: { code: 'MODERATION_REJECTED', message: ERRORS.MODERATION_REJECTED.message, labels: ['Explicit'] },
  });
  assert.deepEqual(errorBody('INTERNAL_ERROR'), {
    error: { code: 'INTERNAL_ERROR', message: ERRORS.INTERNAL_ERROR.message },
  });
});
