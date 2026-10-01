import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import { createTestPool, setupTestDb, resetDb } from '../helpers/db.js';
import { startApp, request } from '../helpers/app.js';

let pool;

before(async () => {
  pool = createTestPool();
  await setupTestDb(pool);
});

beforeEach(async () => {
  await resetDb(pool);
});

after(async () => {
  await pool.end();
});

async function start(t, opts) {
  const app = await startApp(opts);
  t.after(() => app.close());
  return app;
}

// 요청 로그는 res 'finish'에서 찍히므로 응답 수신 직후 아직 없을 수 있다
async function waitLog(logMock, pred) {
  for (let i = 0; i < 50; i++) {
    const hit = logMock.mock.calls.map((c) => c.arguments.join(' ')).find(pred);
    if (hit) return hit;
    await sleep(10);
  }
  assert.fail('기대한 로그 줄이 없음');
}

function mockLog(t) {
  const log = mock.method(console, 'log', () => {});
  t.after(() => log.mock.restore());
  return log;
}

const brokenPool = (err) => ({ query: async () => { throw err; } });

test('BE-01 GET /api/health DB 정상 시 200 { ok: true }', async (t) => {
  const { url } = await start(t, { pool });
  const res = await request(url, '/api/health');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ok: true });
});

test('BE-01 GET /api/health SELECT 1 실패 시 500 INTERNAL_ERROR, 스택·내부 메시지 미노출', async (t) => {
  mockLog(t);
  const { url } = await start(t, { pool: brokenPool(new Error('db down secret')) });
  const res = await request(url, '/api/health');
  assert.equal(res.status, 500);
  assert.deepEqual(Object.keys(res.body), ['error']);
  assert.deepEqual(Object.keys(res.body.error).sort(), ['code', 'message']);
  assert.equal(res.body.error.code, 'INTERNAL_ERROR');
  assert.equal(typeof res.body.error.message, 'string');
  const raw = JSON.stringify(res.body);
  assert.ok(!raw.includes('db down secret'));
  assert.ok(!raw.includes('at '));
});

test('BE-01 처리되지 않은 오류는 error 레벨로 스택을 로그에 남기고 요청 로그에 INTERNAL_ERROR를 기록한다', async (t) => {
  const log = mockLog(t);
  const { url } = await start(t, { pool: brokenPool(new Error('db down secret')) });
  await request(url, '/api/health');
  const detailLine = await waitLog(log, (l) => l.includes('db down secret'));
  assert.equal(JSON.parse(detailLine).level, 'error');
  const reqLine = await waitLog(log, (l) => l.includes('"status":500'));
  const parsed = JSON.parse(reqLine);
  assert.equal(parsed.level, 'error');
  assert.equal(parsed.code, 'INTERNAL_ERROR');
  assert.equal(parsed.method, 'GET');
  assert.equal(parsed.path, '/api/health');
});

test('BE-01 잘못된 JSON 400 VALIDATION_FAILED', async (t) => {
  mockLog(t);
  const { url } = await start(t, { pool });
  const res = await request(url, '/api/auth/login', {
    method: 'POST',
    body: '{bad',
    headers: { 'Content-Type': 'application/json' },
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'VALIDATION_FAILED');
});

test('BE-01 요청 로그는 한 줄 JSON이고 쿼리 문자열(좌표)을 남기지 않는다', async (t) => {
  const log = mockLog(t);
  const { url } = await start(t, { pool });
  const res = await request(url, '/api/health?lat=37.5665&lng=126.978', {
    cookie: 'sid=secret-token-value',
    headers: { 'X-Forwarded-For': '203.0.113.5' },
  });
  assert.equal(res.status, 200);
  const line = await waitLog(log, (l) => l.includes('/api/health'));
  assert.ok(!line.includes('\n'));
  const parsed = JSON.parse(line);
  assert.equal(parsed.level, 'info');
  assert.equal(parsed.method, 'GET');
  assert.equal(parsed.path, '/api/health');
  assert.equal(parsed.status, 200);
  assert.equal(typeof parsed.ms, 'number');
  for (const s of ['37.5665', '126.978', 'secret-token-value', 'sid=', '203.0.113.5']) {
    assert.ok(!line.includes(s), s);
  }
});
