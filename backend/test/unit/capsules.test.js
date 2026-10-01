import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { hashIp } from '../../src/services/capsules.js';

test('BE-09 PRV-04 hashIp는 HMAC-SHA256 hex, 같은 입력은 같은 값', () => {
  const h = hashIp('secret', '203.0.113.5');
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.equal(h, hashIp('secret', '203.0.113.5'));
  assert.equal(h, createHmac('sha256', 'secret').update('203.0.113.5').digest('hex'));
});

test('BE-09 PRV-04 hashIp는 비밀값이나 IP가 다르면 다른 값', () => {
  const h = hashIp('secret', '203.0.113.5');
  assert.notEqual(hashIp('other-secret', '203.0.113.5'), h);
  assert.notEqual(hashIp('secret', '203.0.113.6'), h);
});
