export function maskEmail(email) {
  const at = email.indexOf('@');
  if (at < 1) return '***';
  return `${email[0]}***${email.slice(at)}`;
}

// 허용 목록 밖 필드(쿠키·좌표·토큰·IP·URL 등)는 버린다 (원칙 5.3)
export function formatLog(fields) {
  const { level, method, path, status, ms, code, email, detail } = fields;
  return JSON.stringify({
    time: fields.time ?? new Date().toISOString(),
    level,
    method,
    path,
    status,
    ms,
    code,
    email: email ? maskEmail(email) : undefined,
    detail,
  });
}

export function writeLog(fields) {
  console.log(formatLog(fields));
}
