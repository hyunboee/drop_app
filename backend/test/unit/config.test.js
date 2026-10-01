import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../../src/config.js';

const REQUIRED = ['PORT', 'DATABASE_URL', 'AWS_REGION', 'S3_BUCKET', 'IP_HASH_SECRET'];

const validEnv = () => ({
  PORT: '3000',
  DATABASE_URL: 'postgres://u:secret-pw@localhost:5432/drop_app',
  DB_POOL_MAX: '5',
  AWS_REGION: 'ap-northeast-2',
  S3_BUCKET: 'drop-bucket',
  IP_HASH_SECRET: 'hmac-secret-value',
});

test('BE-01 필수 환경 변수가 모두 있으면 설정을 읽는다', () => {
  assert.deepEqual(loadConfig(validEnv()), {
    port: 3000,
    databaseUrl: 'postgres://u:secret-pw@localhost:5432/drop_app',
    dbPoolMax: 5,
    awsRegion: 'ap-northeast-2',
    s3Bucket: 'drop-bucket',
    ipHashSecret: 'hmac-secret-value',
  });
});

test('BE-01 DB_POOL_MAX가 없으면 기본값 10', () => {
  const env = validEnv();
  delete env.DB_POOL_MAX;
  assert.equal(loadConfig(env).dbPoolMax, 10);
});

for (const name of REQUIRED) {
  test(`BE-01 필수 환경 변수 ${name} 누락 시 config 로딩 실패`, () => {
    const env = validEnv();
    delete env[name];
    assert.throws(() => loadConfig(env), (err) => {
      assert.match(err.message, /Missing env/);
      assert.ok(err.message.includes(name));
      // 값은 메시지에 넣지 않는다
      assert.ok(!err.message.includes('secret-pw'));
      assert.ok(!err.message.includes('hmac-secret-value'));
      return true;
    });
  });

  test(`BE-01 필수 환경 변수 ${name}가 빈 문자열이면 config 로딩 실패`, () => {
    const env = { ...validEnv(), [name]: '' };
    assert.throws(() => loadConfig(env), (err) => err.message.includes(name));
  });
}

test('BE-01 누락된 변수 이름을 모두 메시지에 담는다', () => {
  const env = validEnv();
  delete env.PORT;
  delete env.S3_BUCKET;
  assert.throws(() => loadConfig(env), (err) => {
    assert.ok(err.message.includes('PORT'));
    assert.ok(err.message.includes('S3_BUCKET'));
    return true;
  });
});
