-- 003_capsule_size.sql (ERD 1.7)
ALTER TABLE capsules
  ADD COLUMN size_m real NOT NULL DEFAULT 0.4
    CONSTRAINT capsules_size_m_check CHECK (size_m BETWEEN 0.1 AND 2.0);  -- 사진 긴 변 길이(m)
