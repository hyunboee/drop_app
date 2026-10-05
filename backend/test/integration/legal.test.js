import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestPool, setupTestDb } from '../helpers/db.js';
import { startApp } from '../helpers/app.js';

let pool;

before(async () => {
  pool = createTestPool();
  await setupTestDb(pool);
});

after(async () => {
  await pool.end();
});

const start = async (t) => {
  const app = await startApp({ pool });
  t.after(() => app.close());
  return app;
};

test('로그인 없이 세 문서를 JSON으로 받는다 (제목과 본문)', async (t) => {
  const { url } = await start(t);
  for (const [doc, title] of [['terms', 'Drop 이용약관'], ['privacy', 'Drop 개인정보 처리방침'], ['location', 'Drop 위치정보 이용약관']]) {
    const res = await fetch(`${url}/api/legal/${doc}`);
    assert.equal(res.status, 200, doc);
    const body = await res.json();
    assert.equal(body.title, title);
    assert.ok(body.body.length > 500, doc);
  }
});

test('웹 페이지로도 열리고 HTML 특수문자는 이스케이프된다', async (t) => {
  const { url } = await start(t);
  const res = await fetch(`${url}/legal/privacy`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
  const html = await res.text();
  assert.match(html, /<title>Drop 개인정보 처리방침<\/title>/);
  assert.ok(!html.includes('<script'));
});

test('없는 문서는 404', async (t) => {
  const { url } = await start(t);
  assert.equal((await fetch(`${url}/api/legal/nope`)).status, 404);
  assert.equal((await fetch(`${url}/legal/..%2Fpackage`)).status, 404);
});
