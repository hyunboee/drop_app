import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { maskEmail, formatLog, writeLog } from '../../src/lib/log.js';

test('BE-01 maskEmail은 로컬파트 첫 글자 + *** 로 가린다', () => {
  assert.equal(maskEmail('alice@example.com'), 'a***@example.com');
  assert.equal(maskEmail('b@x.io'), 'b***@x.io');
});

test('BE-01 로그 한 줄에 이메일 원문·쿠키·좌표가 들어가지 않는다', () => {
  const line = formatLog({ email: 'alice@example.com', cookie: 'sid=x', lat: 37.5, lng: 126.9, path: '/api/x' });
  assert.equal(typeof line, 'string');
  assert.ok(!line.includes('\n'));
  assert.ok(!line.includes('alice@'));
  assert.ok(!line.includes('sid='));
  assert.ok(!line.includes('37.5'));
  assert.ok(!line.includes('126.9'));
  const parsed = JSON.parse(line);
  assert.equal(parsed.email, 'a***@example.com');
  assert.equal(parsed.path, '/api/x');
});

test('BE-01 로그는 허용 목록 필드만 남긴다(토큰·IP·URL 제외)', () => {
  const fields = {
    time: '2026-10-01T00:00:00.000Z', level: 'error', method: 'POST', path: '/api/y',
    status: 500, ms: 12, code: 'INTERNAL_ERROR', detail: 'stack here',
    token: 'tok-raw', ip: '203.0.113.5', url: 'https://bucket.s3.amazonaws.com/x?X-Amz-Signature=abc',
  };
  const line = formatLog(fields);
  assert.deepEqual(JSON.parse(line), {
    time: '2026-10-01T00:00:00.000Z', level: 'error', method: 'POST', path: '/api/y',
    status: 500, ms: 12, code: 'INTERNAL_ERROR', detail: 'stack here',
  });
  assert.ok(!line.includes('tok-raw'));
  assert.ok(!line.includes('203.0.113.5'));
  assert.ok(!line.includes('X-Amz'));
});

test('BE-01 time이 없으면 현재 시각 ISO 문자열을 넣는다', () => {
  const before = Date.now();
  const parsed = JSON.parse(formatLog({ level: 'info' }));
  assert.equal(parsed.level, 'info');
  assert.equal(new Date(parsed.time).toISOString(), parsed.time);
  assert.ok(Date.parse(parsed.time) >= before - 1000);
});

test('BE-01 writeLog는 formatLog 결과를 console.log로 한 줄 출력한다', (t) => {
  const log = mock.method(console, 'log', () => {});
  t.after(() => log.mock.restore());
  const fields = { time: '2026-10-01T00:00:00.000Z', level: 'info', email: 'bob@example.com', lat: 1.234 };
  writeLog(fields);
  assert.equal(log.mock.callCount(), 1);
  assert.deepEqual(log.mock.calls[0].arguments, [formatLog(fields)]);
});
