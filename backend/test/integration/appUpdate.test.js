import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTestPool, setupTestDb } from '../helpers/db.js';
import { startApp } from '../helpers/app.js';

let pool;
let dir;

before(async () => {
  pool = createTestPool();
  await setupTestDb(pool);
  dir = await mkdtemp(join(tmpdir(), 'drop-updates-'));
});

after(async () => {
  await pool.end();
  await rm(dir, { recursive: true, force: true });
});

const start = async (t, updatesDir) => {
  const app = await startApp({ pool, updatesDir });
  t.after(() => app.close());
  return app;
};

test('올려 둔 버전이 없으면 latest와 download는 404', async (t) => {
  const { url } = await start(t, join(dir, 'none'));
  assert.equal((await fetch(`${url}/api/app/latest`)).status, 404);
  assert.equal((await fetch(`${url}/api/app/download`)).status, 404);
});

test('로그인 없이 버전 정보를 주고 설치 파일을 그대로 내려준다', async (t) => {
  const bytes = Buffer.from('fake-apk-bytes');
  await writeFile(join(dir, 'latest.json'), JSON.stringify({ version_code: 3, version_name: '0.3.0', notes: '새 기능', sha256: 'abc', size: bytes.length }));
  await writeFile(join(dir, 'drop-outdoor.apk'), bytes);
  const { url } = await start(t, dir);

  const info = await (await fetch(`${url}/api/app/latest`)).json();
  assert.deepEqual(info, { version_code: 3, version_name: '0.3.0', notes: '새 기능', sha256: 'abc', size: bytes.length, download_url: '/api/app/download' });

  const res = await fetch(`${url}/api/app/download`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/vnd.android.package-archive');
  assert.equal(res.headers.get('content-length'), String(bytes.length));
  assert.deepEqual(Buffer.from(await res.arrayBuffer()), bytes);
});

test('버전 정보 파일이 깨져 있으면 404', async (t) => {
  const bad = await mkdtemp(join(tmpdir(), 'drop-updates-bad-'));
  t.after(() => rm(bad, { recursive: true, force: true }));
  await writeFile(join(bad, 'latest.json'), '{not json');
  const { url } = await start(t, bad);
  assert.equal((await fetch(`${url}/api/app/latest`)).status, 404);
});
