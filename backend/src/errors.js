export const ERRORS = {
  AUTH_REQUIRED: { status: 401, message: '로그인이 필요해요' },
  INVALID_CREDENTIALS: { status: 401, message: '이메일 또는 비밀번호가 맞지 않아요' },
  ACCOUNT_LOCKED: { status: 429, message: '로그인 시도가 많아 잠시 후 다시 시도해 주세요' },
  EMAIL_TAKEN: { status: 409, message: '이미 가입된 이메일이에요' },
  VALIDATION_FAILED: { status: 400, message: '입력값을 확인해 주세요' },
  GRADE_NOT_ALLOWED: { status: 400, message: '지금은 브론즈 등급만 드롭할 수 있어요' },
  LOW_ACCURACY: { status: 422, message: '위치 정확도가 낮아요. 잠시 후 다시 시도해 주세요' },
  DROP_TOO_FAR: { status: 422, message: '내 위치에서 10m 안에만 놓을 수 있어요. 위치를 다시 정해 주세요' },
  OUT_OF_RANGE: { status: 403, message: '캡슐에 더 가까이 가야 열 수 있어요' },
  MODERATION_REJECTED: { status: 422, message: '올릴 수 없는 사진이에요' },
  MODERATION_UNAVAILABLE: { status: 503, message: '사진 검사를 할 수 없어요. 다시 시도해 주세요' },
  MEDIA_ALREADY_USED: { status: 409, message: '이미 사용된 미디어예요' },
  NOT_OWNER: { status: 403, message: '내 캡슐만 삭제할 수 있어요' },
  MEDIA_FORBIDDEN: { status: 403, message: '현장에서 열어야 볼 수 있어요' },
  CAPSULE_NOT_FOUND: { status: 404, message: '더 이상 볼 수 없는 캡슐이에요' },
  INTERNAL_ERROR: { status: 500, message: '잠시 후 다시 시도해 주세요' },
};

export class AppError extends Error {
  constructor(code, extra = {}) {
    super(ERRORS[code].message);
    this.code = code;
    this.status = ERRORS[code].status;
    this.extra = extra;
  }
}

export function errorBody(code, extra = {}) {
  return { error: { code, message: ERRORS[code].message, ...extra } };
}
