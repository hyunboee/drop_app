const REQUIRED = ['PORT', 'DATABASE_URL', 'AWS_REGION', 'S3_BUCKET', 'IP_HASH_SECRET'];

export function loadConfig(env = process.env) {
  const missing = REQUIRED.filter((name) => !env[name]);
  if (missing.length > 0) throw new Error(`Missing env: ${missing.join(', ')}`);
  return {
    port: Number(env.PORT),
    databaseUrl: env.DATABASE_URL,
    dbPoolMax: env.DB_POOL_MAX ? Number(env.DB_POOL_MAX) : 10,
    awsRegion: env.AWS_REGION,
    s3Bucket: env.S3_BUCKET,
    ipHashSecret: env.IP_HASH_SECRET,
    googleClientId: env.GOOGLE_CLIENT_ID, // 선택. 없으면 구글 로그인은 실패 처리된다
  };
}
