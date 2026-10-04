-- 004_silver_grade.sql (실험: AR 실증에서 실버 캡슐을 저장해 보기 위해 SILVER를 허용한다)
-- 실결제(N3) 없이 실버를 허용하는 임시 조치다. 출시 전에 결제 확인과 함께 다시 정해야 한다 (docs/13 DQ-10)
ALTER TABLE capsules DROP CONSTRAINT capsules_grade_check;
ALTER TABLE capsules ADD CONSTRAINT capsules_grade_check CHECK (grade IN ('BRONZE', 'SILVER'));
