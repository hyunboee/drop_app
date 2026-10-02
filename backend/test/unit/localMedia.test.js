import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import { createLocalModeration, createLocalStorage, UPLOAD_PATH } from '../../src/dev/localMedia.js';

const ID = '11111111-2222-3333-4444-555555555555';
const KEY = `media/${ID}.jpg`;

test('DEV 로컬 미디어: PUT 저장 → head·stream·중복 412·삭제', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'drop-media-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const storage = createLocalStorage(dir);
  const server = express().use(UPLOAD_PATH, storage.router).listen(0);
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;

  const target = await storage.createUploadUrl(KEY);
  assert.equal(target.url, `${UPLOAD_PATH}/${KEY}`);
  const put = () => fetch(base + target.url, { method: 'PUT', headers: target.headers, body: Buffer.from('jpeg') });

  assert.equal(await storage.headObject(KEY), null);
  assert.equal((await put()).status, 200);
  assert.deepEqual(await storage.headObject(KEY), { contentLength: 4, contentType: 'image/jpeg' });
  assert.equal((await put()).status, 412);

  const chunks = [];
  for await (const c of await storage.getObjectStream(KEY)) chunks.push(c);
  assert.equal(Buffer.concat(chunks).toString(), 'jpeg');
  assert.equal((await readFile(join(dir, KEY))).toString(), 'jpeg');

  const bad = await fetch(`${base}${UPLOAD_PATH}/media/..%2Fx.jpg`, { method: 'PUT', headers: target.headers, body: 'x' });
  assert.equal(bad.status, 400);

  await storage.removePendingTag(KEY);
  await storage.deleteObjects([KEY, `media/${ID}.thumb.jpg`]);
  assert.equal(await storage.headObject(KEY), null);
});

test('DEV 로컬 검열은 항상 통과', async () => {
  assert.deepEqual(await createLocalModeration().moderate(KEY), { rejected: false, labels: [] });
});
