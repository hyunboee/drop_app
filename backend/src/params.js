// PRM-01 열람 반경
export const PRM_01_OPEN_RADIUS_M = 10;
// PRM-03 accuracy 보정 상한
export const PRM_03_ACCURACY_CAP_M = 20;
// PRM-03 재측정 기준
export const PRM_03_REMEASURE_ACCURACY_M = 30;
// PRM-20 드롭 배치 반경 (드롭하는 사람 위치에서 앵커까지)
export const PRM_20_DROP_PLACE_RADIUS_M = 10;
// PRM-06 브론즈 유효 시간 (30일)
export const PRM_06_BRONZE_TTL_HOURS = 720;
// M-01 주변 조회 반경
export const M_01_NEARBY_RADIUS_M = 200;
// M-03 업로드 Presigned URL 유효 시간 (5분)
export const M_03_UPLOAD_URL_TTL_SEC = 300;
// M-04 세션 유효 기간 (30일, 쿠키 Max-Age·세션 expires_at 공용)
export const M_04_SESSION_TTL_SEC = 2592000;
// M-05 로그인 실패 허용 횟수
export const M_05_LOGIN_MAX_FAILURES = 5;
// M-05 로그인 잠금 시간 (15분)
export const M_05_LOGIN_LOCK_MS = 900000;
// M-06 사진 최대 크기 (10MB)
export const M_06_PHOTO_MAX_BYTES = 10485760;
// M-09 Rekognition 제한 시간 (10초)
export const M_09_REKOGNITION_TIMEOUT_MS = 10000;
// M-10 비밀번호 최소 길이
export const M_10_PASSWORD_MIN_LENGTH = 8;
// M-11 제목 길이 (코드 포인트 수)
export const M_11_TITLE_MIN_LENGTH = 1;
// M-11
export const M_11_TITLE_MAX_LENGTH = 40;
// M-14 검열 최소 신뢰도
export const M_14_MIN_CONFIDENCE = 80;
// M-14 거부 라벨
export const M_14_REJECT_LABELS = ['Explicit', 'Violence', 'Visually Disturbing', 'Hate Symbols'];
// FR-01 약관 버전 (users.terms_version)
export const TERMS_VERSION = '2026-10-01';
