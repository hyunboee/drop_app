import { AppError } from '../errors.js';

const ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];

// 앱이 구글에서 받은 ID 토큰이 우리 앱용으로 발급된 진짜인지 구글에 물어 확인한다.
// ponytail: 구글의 tokeninfo 주소를 쓴다(요청마다 구글을 한 번 부른다). 로그인이 많아지면 공개 키로 직접 검증한다
export function createGoogleVerifier(clientId, fetchImpl = fetch) {
  return async (idToken) => {
    if (!clientId) throw new AppError('GOOGLE_AUTH_FAILED');
    let claims;
    try {
      const res = await fetchImpl(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new AppError('GOOGLE_AUTH_FAILED');
      claims = await res.json();
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError('GOOGLE_AUTH_FAILED');
    }
    const valid =
      claims.aud === clientId &&
      ISSUERS.includes(claims.iss) &&
      Number(claims.exp) * 1000 > Date.now() &&
      claims.email_verified === 'true' &&
      typeof claims.sub === 'string' &&
      typeof claims.email === 'string';
    if (!valid) throw new AppError('GOOGLE_AUTH_FAILED');
    return { sub: claims.sub, email: claims.email.toLowerCase() };
  };
}
