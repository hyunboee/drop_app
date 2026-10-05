-- 006_grades_safety.sql
-- 등급: 브론즈(1개월)·실버(2년)·다이아(평생, expires_at = 'infinity'). 실결제 전까지 누구나 저장할 수 있는 실험 상태다
ALTER TABLE capsules DROP CONSTRAINT capsules_grade_check;
ALTER TABLE capsules ADD CONSTRAINT capsules_grade_check CHECK (grade IN ('BRONZE', 'SILVER', 'DIAMOND'));

-- 사용자 차단: 차단한 사람(blocker)에게 차단당한 사람(blocked)의 캡슐이 보이지 않는다
CREATE TABLE blocks (
  blocker_id uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  blocked_id uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

-- 캡슐 신고: 신고한 사람에게는 그 캡슐이 바로 보이지 않고, 운영자가 검토한다(reports 테이블을 직접 본다)
CREATE TABLE reports (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  capsule_id  uuid        NOT NULL REFERENCES capsules (id) ON DELETE CASCADE,
  reason      text        NOT NULL CHECK (reason IN ('ABUSE', 'SEXUAL', 'VIOLENCE', 'PRIVACY', 'COPYRIGHT', 'OTHER')),
  detail      text        CHECK (detail IS NULL OR char_length(detail) <= 500),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reporter_id, capsule_id)
);
CREATE INDEX idx_reports_capsule_id ON reports (capsule_id);
