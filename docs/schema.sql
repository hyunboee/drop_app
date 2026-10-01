-- Drop MVP 스키마 (PostgreSQL 17)
-- 출처: docs/7-erd.md v0.3 (1장 MVP 물리 ERD, 1.5 운영용 테이블)
-- 조정 가능한 값(M-11 제목 상한, PRM-03 재측정 기준, PRM-06 유지 기간)은 CHECK에 넣지 않고 앱에서 검증한다 (원칙 P-05).
-- backend/db/migrations/001_init.sql은 이 파일을 그대로 복사한다. 트랜잭션은 migrate.js가 감싼다.
-- 단독 실행: postgresql MCP pg_execute_sql로 빈 DB에 이 파일 내용을 실행한다 (docs/8-plan.md 2.5)

-- 1.1 users
-- 이메일은 앱에서 소문자로 정규화해 저장한다 (E6). 로그인 잠금은 DB에 저장하지 않는다 (E1).
CREATE TABLE users (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text        NOT NULL UNIQUE,
  password_salt text        NOT NULL,
  password_hash text        NOT NULL,
  terms_version text        NOT NULL,  -- 동의한 약관 버전, 동의 시각은 created_at (E5)
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- 1.2 sessions
-- 토큰 원문은 저장하지 않고 SHA-256 해시만 저장한다. 조회 조건: token_hash = $1 AND expires_at > now()
CREATE TABLE sessions (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash text        NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL  -- created_at + M-04
);

-- 1.3 capsules
-- 검열을 통과한 캡슐만 행으로 만든다 (FR-06). 만료는 status = 'ACTIVE' AND expires_at > now()로 판정한다.
-- 원본·썸네일 S3 키는 media_id에서 만든다: media/{media_id}.jpg, media/{media_id}.thumb.jpg
CREATE TABLE capsules (
  id           uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid             NOT NULL REFERENCES users (id),  -- 소유자
  media_id     uuid             NOT NULL UNIQUE,
  title        text             NOT NULL CHECK (char_length(title) >= 1),
  grade        text             NOT NULL DEFAULT 'BRONZE' CHECK (grade = 'BRONZE'),
  lat          double precision NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng          double precision NOT NULL CHECK (lng BETWEEN -180 AND 180),
  accuracy     double precision NOT NULL CHECK (accuracy >= 0),               -- 드롭 시 GPS 정확도(m)
  heading      double precision NOT NULL CHECK (heading >= 0 AND heading < 360), -- 드롭 시 기기 방향(도)
  status       text             NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DELETED')),
  published_at timestamptz      NOT NULL DEFAULT now(),
  expires_at   timestamptz      NOT NULL  -- published_at + PRM-06
);

-- 주변 조회: 위경도 범위로 먼저 좁힌 뒤 SQL로 거리 계산 (FR-08, NFR-04)
CREATE INDEX idx_capsules_lat_lng ON capsules (lat, lng);

-- 1.4 view_records
-- 판정을 통과한 열람마다 한 행. IP는 HMAC-SHA256 해시만 저장한다.
CREATE TABLE view_records (
  id         uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
  capsule_id uuid             NOT NULL REFERENCES capsules (id),
  user_id    uuid             NOT NULL REFERENCES users (id),  -- 뷰어
  lat        double precision NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng        double precision NOT NULL CHECK (lng BETWEEN -180 AND 180),
  accuracy   double precision NOT NULL CHECK (accuracy >= 0),
  ip_hash    text             NOT NULL,
  viewed_at  timestamptz      NOT NULL DEFAULT now()
);

-- 원본 미디어 권한 확인(이 뷰어의 해당 캡슐 열람 기록 존재)과 capsule_id FK 조회 (FR-10, NFR-08)
CREATE INDEX idx_view_records_capsule_id_user_id ON view_records (capsule_id, user_id);

-- 1.5 운영용: 마이그레이션 적용 이력 (scripts/migrate.js)
CREATE TABLE IF NOT EXISTS schema_migrations (  -- migrate.js도 시작 시 같은 문으로 만든다
  filename   text        PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
