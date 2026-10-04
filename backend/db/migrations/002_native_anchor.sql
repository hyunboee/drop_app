-- 002_native_anchor.sql (네이티브 N1, ERD 1.6)
ALTER TABLE capsules
  ADD COLUMN cloud_anchor_id text,   -- ARCore 클라우드 앵커 ID (웹 캡슐은 NULL)
  ADD COLUMN geo_pose        jsonb;  -- Geospatial 포즈 { lat, lng, alt, qx, qy, qz, qw } (없으면 NULL)

ALTER TABLE view_records
  ADD COLUMN plane_match boolean NOT NULL DEFAULT false;  -- 앵커로 고정된 프레임을 탭했는지
