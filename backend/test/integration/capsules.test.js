import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createTestPool, setupTestDb, resetDb, insertUser, insertSession, insertCapsule } from '../helpers/db.js';
import { startApp, request } from '../helpers/app.js';
import { createFakeStorage, createFakeModeration } from '../helpers/aws.js';
import { AppError } from '../../src/errors.js';
import {
  M_06_PHOTO_MAX_BYTES,
  M_11_TITLE_MAX_LENGTH,
  PRM_03_REMEASURE_ACCURACY_M,
  PRM_06_BRONZE_TTL_HOURS,
} from '../../src/params.js';

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

async function start(t, opts = {}) {
  const app = await startApp({ pool, ...opts });
  t.after(() => app.close());
  return app;
}

async function loggedIn() {
  const user = await insertUser(pool);
  const { cookie } = await insertSession(pool, user.id);
  return { ...user, cookie };
}

const assertError = (res, status, code) => {
  assert.equal(res.status, status);
  assert.equal(res.body.error.code, code);
};

const count = async (sql = 'SELECT count(*) FROM capsules', params) =>
  Number((await pool.query(sql, params)).rows[0].count);

const keysOf = (mediaId) => ({ original: `media/${mediaId}.jpg`, thumb: `media/${mediaId}.thumb.jpg` });
const capsuleBody = (over = {}) => ({
  media_id: randomUUID(),
  title: '첫 캡슐',
  grade: 'BRONZE',
  lat: 37.5665,
  lng: 126.978,
  accuracy: 5,
  heading: 90,
  ...over,
});
const publish = (url, cookie, body) => request(url, '/api/capsules', { method: 'POST', cookie, body });
const args = (fn) => fn.mock.calls.map((c) => c.arguments);

// ---------- 성공 ----------

test('BE-06 FR-06·FR-07 원본·썸네일 통과 시 201, expires_at - published_at = PRM-06, status ACTIVE', async (t) => {
  const { url, storage, moderation } = await start(t);
  const user = await loggedIn();
  const body = capsuleBody();
  const k = keysOf(body.media_id);

  const res = await publish(url, user.cookie, body);
  assert.equal(res.status, 201);
  assert.deepEqual(Object.keys(res.body).sort(), ['expires_at', 'id']);

  const { rows } = await pool.query(
    `SELECT user_id, media_id, title, grade, lat, lng, accuracy, heading, status, expires_at,
            extract(epoch FROM expires_at - published_at) AS sec
       FROM capsules WHERE id = $1`,
    [res.body.id],
  );
  assert.equal(rows.length, 1);
  const row = rows[0];
  assert.equal(row.status, 'ACTIVE');
  assert.equal(Number(row.sec), PRM_06_BRONZE_TTL_HOURS * 3600);
  assert.equal(new Date(res.body.expires_at).getTime(), row.expires_at.getTime());
  assert.equal(row.user_id, user.id);
  assert.equal(row.media_id, body.media_id);
  assert.equal(row.title, body.title);
  assert.equal(row.grade, 'BRONZE');
  assert.deepEqual([row.lat, row.lng, row.accuracy, row.heading], [body.lat, body.lng, body.accuracy, body.heading]);

  assert.deepEqual(args(storage.headObject), [[k.original], [k.thumb]]);
  assert.deepEqual(args(moderation.moderate), [[k.original], [k.thumb]]);
  assert.deepEqual(args(storage.removePendingTag), [[k.original], [k.thumb]]);
  assert.equal(storage.deleteObjects.mock.callCount(), 0);
});

test('BE-06 아키텍처 2.1 removePendingTag가 INSERT보다 먼저 호출된다', async (t) => {
  const seen = [];
  const storage = createFakeStorage({
    removePendingTag: async () => {
      seen.push(await count());
    },
  });
  const { url } = await start(t, { storage });
  const user = await loggedIn();
  const res = await publish(url, user.cookie, capsuleBody());
  assert.equal(res.status, 201);
  assert.deepEqual(seen, [0, 0]);
  assert.equal(await count(), 1);
});

test('BE-06 M-11 제목 40자(코드 포인트 기준, 이모지 40개)는 201', async (t) => {
  const { url } = await start(t);
  const user = await loggedIn();
  const title = '😀'.repeat(M_11_TITLE_MAX_LENGTH);
  const res = await publish(url, user.cookie, capsuleBody({ title }));
  assert.equal(res.status, 201);
  const { rows } = await pool.query('SELECT title FROM capsules WHERE id = $1', [res.body.id]);
  assert.equal(rows[0].title, title);
});

// ---------- 검열 ----------

for (const [name, rejectSuffix, labels] of [
  ['원본만', '.jpg', ['Explicit']],
  ['썸네일만', '.thumb.jpg', ['Violence']],
]) {
  test(`BE-06 BR-33 ${name} 거부 422 MODERATION_REJECTED + labels, 행 없음, deleteObjects(원본·썸네일)`, async (t) => {
    const isTarget = (key) => (rejectSuffix === '.thumb.jpg' ? key.endsWith('.thumb.jpg') : !key.endsWith('.thumb.jpg'));
    const moderation = createFakeModeration(async (key) =>
      isTarget(key) ? { rejected: true, labels } : { rejected: false, labels: [] },
    );
    const { url, storage } = await start(t, { moderation });
    const user = await loggedIn();
    const body = capsuleBody();
    const k = keysOf(body.media_id);

    const res = await publish(url, user.cookie, body);
    assertError(res, 422, 'MODERATION_REJECTED');
    assert.deepEqual(res.body.error.labels, labels);
    assert.equal(await count(), 0);
    assert.deepEqual(args(storage.deleteObjects), [[[k.original, k.thumb]]]);
    assert.equal(storage.removePendingTag.mock.callCount(), 0);
  });
}

test('BE-06 M-09 검열 실패·제한 시간 초과 시 503 MODERATION_UNAVAILABLE, 행 없음, deleteObjects 미호출, 같은 media_id 재요청 201', async (t) => {
  let down = true;
  const moderation = createFakeModeration(async () => {
    if (down) throw new AppError('MODERATION_UNAVAILABLE');
    return { rejected: false, labels: [] };
  });
  const { url, storage } = await start(t, { moderation });
  const user = await loggedIn();
  const body = capsuleBody();

  assertError(await publish(url, user.cookie, body), 503, 'MODERATION_UNAVAILABLE');
  assert.equal(await count(), 0);
  assert.equal(storage.deleteObjects.mock.callCount(), 0);
  assert.equal(storage.removePendingTag.mock.callCount(), 0);

  down = false;
  const retry = await publish(url, user.cookie, body);
  assert.equal(retry.status, 201);
  assert.equal(await count(), 1);
  assert.equal(storage.deleteObjects.mock.callCount(), 0);
});

// ---------- 입력 검증 ----------

test('BE-06 M-11 제목 0자·41자·문자열 아님, 위경도 범위 밖, accuracy 음수, heading 360 등은 400 VALIDATION_FAILED', async (t) => {
  const { url, storage, moderation } = await start(t);
  const user = await loggedIn();
  const cases = [
    { title: '' },
    { title: 'a'.repeat(M_11_TITLE_MAX_LENGTH + 1) },
    { title: 123 },
    { title: undefined },
    { media_id: 'not-a-uuid' },
    { media_id: undefined },
    { lat: 91 },
    { lat: -91 },
    { lat: '37.5' },
    { lng: 181 },
    { lng: -181 },
    { lng: null },
    { accuracy: -1 },
    { accuracy: '5' },
    { heading: 360 },
    { heading: -1 },
    { heading: undefined },
    { grade: undefined },
    { grade: 1 },
    { title: '', grade: 'SILVER' }, // 형식 검증이 등급 검사보다 먼저
  ];
  for (const over of cases) {
    const res = await publish(url, user.cookie, capsuleBody(over));
    assertError(res, 400, 'VALIDATION_FAILED');
  }
  assert.equal(await count(), 0);
  assert.equal(storage.headObject.mock.callCount(), 0);
  assert.equal(moderation.moderate.mock.callCount(), 0);
});

test('BE-06 위경도·heading 경계값(lat ±90, lng ±180, heading 0, accuracy 0)은 201', async (t) => {
  const { url } = await start(t);
  const user = await loggedIn();
  for (const over of [
    { lat: 90, lng: 180, heading: 0, accuracy: 0 },
    { lat: -90, lng: -180, heading: 359.9 },
  ]) {
    assert.equal((await publish(url, user.cookie, capsuleBody(over))).status, 201);
  }
});

test('BE-06 본문이 객체가 아니면 400 VALIDATION_FAILED', async (t) => {
  const { url } = await start(t);
  const user = await loggedIn();
  for (const body of ['"text"', '[1]', 'null']) {
    const res = await request(url, '/api/capsules', {
      method: 'POST',
      cookie: user.cookie,
      body,
      headers: { 'Content-Type': 'application/json' },
    });
    assertError(res, 400, 'VALIDATION_FAILED');
  }
  assertError(await request(url, '/api/capsules', { method: 'POST', cookie: user.cookie }), 400, 'VALIDATION_FAILED');
});

test('BE-06 grade: SILVER는 400 GRADE_NOT_ALLOWED', async (t) => {
  const { url, storage } = await start(t);
  const user = await loggedIn();
  assertError(await publish(url, user.cookie, capsuleBody({ grade: 'SILVER' })), 400, 'GRADE_NOT_ALLOWED');
  assert.equal(await count(), 0);
  assert.equal(storage.headObject.mock.callCount(), 0);
});

test('BE-06 FR-03 accuracy가 PRM-03 재측정 기준과 같으면 201, 초과하면 422 LOW_ACCURACY', async (t) => {
  const { url, storage } = await start(t);
  const user = await loggedIn();
  const ok = await publish(url, user.cookie, capsuleBody({ accuracy: PRM_03_REMEASURE_ACCURACY_M }));
  assert.equal(ok.status, 201);
  const headCalls = storage.headObject.mock.callCount();

  const low = await publish(url, user.cookie, capsuleBody({ accuracy: PRM_03_REMEASURE_ACCURACY_M + 0.01 }));
  assertError(low, 422, 'LOW_ACCURACY');
  assert.equal(await count(), 1);
  assert.equal(storage.headObject.mock.callCount(), headCalls);
});

// ---------- HeadObject ----------

for (const [name, head] of [
  ['M-06 초과', async () => ({ contentLength: M_06_PHOTO_MAX_BYTES + 1, contentType: 'image/jpeg' })],
  ['image/jpeg 아님', async () => ({ contentLength: 1000, contentType: 'image/png' })],
  ['객체 없음', async () => null],
  ['썸네일만 M-06 초과', async (key) => ({
    contentLength: key.endsWith('.thumb.jpg') ? M_06_PHOTO_MAX_BYTES + 1 : 1000,
    contentType: 'image/jpeg',
  })],
  ['썸네일만 없음', async (key) => (key.endsWith('.thumb.jpg') ? null : { contentLength: 1000, contentType: 'image/jpeg' })],
]) {
  test(`BE-06 M-06 HeadObject ${name}이면 400 VALIDATION_FAILED, 검열·INSERT 없음`, async (t) => {
    const storage = createFakeStorage({ headObject: head });
    const { url, moderation } = await start(t, { storage });
    const user = await loggedIn();
    assertError(await publish(url, user.cookie, capsuleBody()), 400, 'VALIDATION_FAILED');
    assert.equal(moderation.moderate.mock.callCount(), 0);
    assert.equal(storage.removePendingTag.mock.callCount(), 0);
    assert.equal(await count(), 0);
  });
}

test('BE-06 M-06 HeadObject 크기가 정확히 M-06이면 201', async (t) => {
  const storage = createFakeStorage({
    headObject: async () => ({ contentLength: M_06_PHOTO_MAX_BYTES, contentType: 'image/jpeg' }),
  });
  const { url } = await start(t, { storage });
  const user = await loggedIn();
  assert.equal((await publish(url, user.cookie, capsuleBody())).status, 201);
});

// ---------- 멱등·중복 ----------

test('BE-06 같은 유저가 같은 media_id로 재요청하면 200, 같은 id·expires_at, 행 1개, 검열·S3 호출 없음', async (t) => {
  const { url, storage, moderation } = await start(t);
  const user = await loggedIn();
  const body = capsuleBody();
  const first = await publish(url, user.cookie, body);
  assert.equal(first.status, 201);

  const calls = () =>
    [storage.headObject, storage.removePendingTag, storage.deleteObjects, moderation.moderate].map((f) =>
      f.mock.callCount(),
    );
  const before = calls();

  const again = await publish(url, user.cookie, { ...body, title: '다른 제목' });
  assert.equal(again.status, 200);
  assert.deepEqual(again.body, first.body);
  assert.equal(await count(), 1);
  assert.deepEqual(calls(), before);
});

test('BE-06 다른 유저가 이미 게시된 media_id로 요청하면 409 MEDIA_ALREADY_USED, 행 변화 없음', async (t) => {
  const { url, storage, moderation } = await start(t);
  const owner = await insertUser(pool);
  const cap = await insertCapsule(pool, { userId: owner.id });
  const other = await loggedIn();

  assertError(await publish(url, other.cookie, capsuleBody({ media_id: cap.media_id })), 409, 'MEDIA_ALREADY_USED');
  const { rows } = await pool.query('SELECT id, user_id, title, status FROM capsules');
  assert.deepEqual(rows, [{ id: cap.id, user_id: owner.id, title: '테스트 캡슐', status: 'ACTIVE' }]);
  assert.equal(storage.headObject.mock.callCount(), 0);
  assert.equal(moderation.moderate.mock.callCount(), 0);
});

test('BE-06 삭제된 캡슐의 media_id도 재사용할 수 없다(같은 유저 200, 다른 유저 409)', async (t) => {
  const { url } = await start(t);
  const owner = await loggedIn();
  const cap = await insertCapsule(pool, { userId: owner.id, status: 'DELETED' });
  const other = await loggedIn();
  const same = await publish(url, owner.cookie, capsuleBody({ media_id: cap.media_id }));
  assert.equal(same.status, 200);
  assert.equal(same.body.id, cap.id);
  assertError(await publish(url, other.cookie, capsuleBody({ media_id: cap.media_id })), 409, 'MEDIA_ALREADY_USED');
});

// 동시 요청: INSERT 직전(removePendingTag)에 같은 media_id 행이 먼저 생기면 UNIQUE 위반 → 재조회
for (const [name, racer, expect] of [
  ['다른 유저가 먼저 INSERT하면 409', 'other', 409],
  ['같은 유저 요청이 먼저 INSERT하면 200', 'self', 200],
]) {
  test(`BE-06 8장 #7 동시 게시 media_id UNIQUE 위반 시 재조회: ${name}`, async (t) => {
    const user = await loggedIn();
    const other = await insertUser(pool);
    const body = capsuleBody();
    let raced;
    const storage = createFakeStorage({
      removePendingTag: async (key) => {
        if (key.endsWith('.thumb.jpg') && !raced) {
          raced = await insertCapsule(pool, { userId: racer === 'self' ? user.id : other.id, mediaId: body.media_id });
        }
      },
    });
    const { url } = await start(t, { storage });
    const res = await publish(url, user.cookie, body);
    assert.equal(res.status, expect);
    if (expect === 409) {
      assert.equal(res.body.error.code, 'MEDIA_ALREADY_USED');
    } else {
      assert.equal(res.body.id, raced.id);
      assert.equal(new Date(res.body.expires_at).getTime(), raced.expires_at.getTime());
    }
    assert.equal(await count(), 1);
  });
}

test('BE-06 비로그인 401 AUTH_REQUIRED', async (t) => {
  const { url, storage } = await start(t);
  assertError(await publish(url, undefined, capsuleBody()), 401, 'AUTH_REQUIRED');
  assert.equal(storage.headObject.mock.callCount(), 0);
  assert.equal(await count(), 0);
});
