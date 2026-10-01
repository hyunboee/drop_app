import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { mediaKeys, createStorage } from '../../src/aws/storage.js';
import { M_03_UPLOAD_URL_TTL_SEC } from '../../src/params.js';

const CREDENTIALS = { accessKeyId: 'test', secretAccessKey: 'test' };
const make = () => createStorage({ region: 'ap-northeast-2', bucket: 'b', credentials: CREDENTIALS });
const KEY = 'media/x.jpg';

// send를 가짜로 바꾸고 받은 명령을 기록한다
function mockSend(t, s, impl = async () => ({})) {
  return t.mock.method(s.client, 'send', impl);
}

const sentCommand = (send, i = 0) => send.mock.calls[i].arguments[0];

test('BE-04 mediaKeys는 원본·썸네일 키를 만든다', () => {
  assert.deepEqual(mediaKeys('abc'), { original: 'media/abc.jpg', thumb: 'media/abc.thumb.jpg' });
});

test('BE-04 Presigned PUT URL이 content-type·if-none-match·x-amz-tagging을 서명하고 유효 시간이 M-03이다', async () => {
  const { url } = await make().createUploadUrl(KEY);
  const u = new URL(url);
  assert.equal(u.protocol, 'https:');
  assert.ok(u.href.includes('/media/x.jpg'));
  assert.equal(u.searchParams.get('X-Amz-Expires'), String(M_03_UPLOAD_URL_TTL_SEC));
  const signed = u.searchParams.get('X-Amz-SignedHeaders').split(';');
  for (const h of ['content-type', 'if-none-match', 'x-amz-tagging', 'host']) {
    assert.ok(signed.includes(h), h);
  }
  // x-amz-tagging은 쿼리로 올라가지 않고 헤더로 남아야 브라우저가 보내도록 강제된다
  assert.equal(u.searchParams.has('x-amz-tagging'), false);
  assert.ok(u.searchParams.get('X-Amz-Signature'));
});

test('BE-04 R-4 Presigned PUT URL에 체크섬 파라미터가 없다', async () => {
  const { url } = await make().createUploadUrl(KEY);
  const lower = decodeURIComponent(url).toLowerCase();
  assert.ok(!lower.includes('x-amz-checksum'));
  assert.ok(!lower.includes('x-amz-sdk-checksum-algorithm'));
});

test('BE-04 createUploadUrl은 브라우저가 PUT에 실을 헤더 3개를 돌려준다', async () => {
  const { headers } = await make().createUploadUrl(KEY);
  assert.deepEqual(headers, {
    'Content-Type': 'image/jpeg',
    'If-None-Match': '*',
    'x-amz-tagging': 'status=pending',
  });
});

test('BE-04 createUploadUrl은 S3에 요청을 보내지 않는다(서명만)', async (t) => {
  const s = make();
  const send = mockSend(t, s);
  await s.createUploadUrl(KEY);
  assert.equal(send.mock.callCount(), 0);
});

test('BE-04 headObject는 HeadObject를 버킷·키로 보내고 크기·형식을 돌려준다', async (t) => {
  const s = make();
  const send = mockSend(t, s, async () => ({ ContentLength: 1234, ContentType: 'image/jpeg' }));
  assert.deepEqual(await s.headObject(KEY), { contentLength: 1234, contentType: 'image/jpeg' });
  assert.equal(send.mock.callCount(), 1);
  assert.equal(sentCommand(send).constructor.name, 'HeadObjectCommand');
  assert.deepEqual(sentCommand(send).input, { Bucket: 'b', Key: KEY });
});

test('BE-04 headObject는 404면 null', async (t) => {
  const s = make();
  mockSend(t, s, async () => {
    throw Object.assign(new Error('NotFound'), { name: 'NotFound', $metadata: { httpStatusCode: 404 } });
  });
  assert.equal(await s.headObject(KEY), null);
});

test('BE-04 headObject는 404 외 오류를 다시 던진다', async (t) => {
  const s = make();
  const forbidden = Object.assign(new Error('Forbidden'), { $metadata: { httpStatusCode: 403 } });
  mockSend(t, s, async () => { throw forbidden; });
  await assert.rejects(s.headObject(KEY), (err) => err === forbidden);
});

test('BE-04 headObject는 $metadata 없는 오류(네트워크)도 다시 던진다', async (t) => {
  const s = make();
  const network = new Error('ECONNRESET');
  mockSend(t, s, async () => { throw network; });
  await assert.rejects(s.headObject(KEY), (err) => err === network);
});

test('BE-04 getObjectStream은 GetObject를 버킷·키로 보내고 Body를 돌려준다', async (t) => {
  const s = make();
  const body = Readable.from([Buffer.from('jpeg')]);
  const send = mockSend(t, s, async () => ({ Body: body }));
  assert.equal(await s.getObjectStream(KEY), body);
  assert.equal(sentCommand(send).constructor.name, 'GetObjectCommand');
  assert.deepEqual(sentCommand(send).input, { Bucket: 'b', Key: KEY });
});

test('BE-04 removePendingTag는 DeleteObjectTagging을 버킷·키로 보낸다', async (t) => {
  const s = make();
  const send = mockSend(t, s);
  assert.equal(await s.removePendingTag(KEY), undefined);
  assert.equal(send.mock.callCount(), 1);
  assert.equal(sentCommand(send).constructor.name, 'DeleteObjectTaggingCommand');
  assert.deepEqual(sentCommand(send).input, { Bucket: 'b', Key: KEY });
});

test('BE-04 deleteObjects는 DeleteObjects 한 번으로 원본·썸네일을 지운다', async (t) => {
  const s = make();
  const send = mockSend(t, s);
  const keys = ['media/x.jpg', 'media/x.thumb.jpg'];
  assert.equal(await s.deleteObjects(keys), undefined);
  assert.equal(send.mock.callCount(), 1);
  assert.equal(sentCommand(send).constructor.name, 'DeleteObjectsCommand');
  assert.deepEqual(sentCommand(send).input, {
    Bucket: 'b',
    Delete: { Objects: [{ Key: 'media/x.jpg' }, { Key: 'media/x.thumb.jpg' }] },
  });
});
