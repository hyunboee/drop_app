-- 005_google_login.sql (구글 로그인)
-- 구글로 가입한 사용자는 비밀번호가 없다. google_sub는 구글이 주는 사용자 고유 번호다
ALTER TABLE users
  ALTER COLUMN password_salt DROP NOT NULL,
  ALTER COLUMN password_hash DROP NOT NULL,
  ADD COLUMN google_sub text UNIQUE;
ALTER TABLE users
  ADD CONSTRAINT users_login_method_check CHECK (password_hash IS NOT NULL OR google_sub IS NOT NULL);
