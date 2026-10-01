import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createModeration } from '../../src/aws/moderation.js';
import { AppError } from '../../src/errors.js';
import { M_09_REKOGNITION_TIMEOUT_MS, M_14_MIN_CONFIDENCE } from '../../src/params.js';

const CREDENTIALS = { accessKeyId: 'test', secretAccessKey: 'test' };
const make = () => createModeration({ region: 'ap-northeast-2', bucket: 'b', credentials: CREDENTIALS });
const KEY = 'media/x.jpg';

function withLabels(t, labels) {
  const m = make();
  const send = t.mock.method(m.client, 'send', async () => ({ ModerationLabels: labels }));
  return { m, send };
}

const label = (Name, ParentName = '', Confidence = 95) => ({ Name, ParentName, Confidence });

test('BE-04 M-14 DetectModerationLabels를 S3 객체 직접 참조·MinConfidence 80으로 보낸다', async (t) => {
  const { m, send } = withLabels(t, []);
  await m.moderate(KEY);
  assert.equal(send.mock.callCount(), 1);
  const [cmd, opts] = send.mock.calls[0].arguments;
  assert.equal(cmd.constructor.name, 'DetectModerationLabelsCommand');
  assert.deepEqual(cmd.input, { Image: { S3Object: { Bucket: 'b', Name: KEY } }, MinConfidence: M_14_MIN_CONFIDENCE });
  assert.equal(M_14_MIN_CONFIDENCE, 80);
  assert.ok(opts.abortSignal instanceof AbortSignal);
});

test('BE-04 M-14 라벨이 없으면 rejected false', async (t) => {
  const { m } = withLabels(t, []);
  assert.deepEqual(await m.moderate(KEY), { rejected: false, labels: [] });
});

test('BE-04 M-14 최상위 라벨 Explicit은 rejected true', async (t) => {
  const { m } = withLabels(t, [label('Explicit')]);
  assert.deepEqual(await m.moderate(KEY), { rejected: true, labels: ['Explicit'] });
});

test('BE-04 M-14 거부 라벨 4종 각각 최상위로 오면 rejected true', async (t) => {
  for (const name of ['Explicit', 'Violence', 'Visually Disturbing', 'Hate Symbols']) {
    const m = make();
    t.mock.method(m.client, 'send', async () => ({ ModerationLabels: [label(name)] }));
    assert.deepEqual(await m.moderate(KEY), { rejected: true, labels: [name] }, name);
  }
});

test('BE-04 M-14 상위 라벨(ParentName) Violence면 rejected true, labels에는 상위 라벨 이름', async (t) => {
  const { m } = withLabels(t, [label('Graphic Violence', 'Violence')]);
  assert.deepEqual(await m.moderate(KEY), { rejected: true, labels: ['Violence'] });
});

test('BE-04 M-14 같은 거부 라벨이 여러 번 와도 labels는 중복 제거된다', async (t) => {
  const { m } = withLabels(t, [
    label('Violence'),
    label('Graphic Violence', 'Violence'),
    label('Weapon Violence', 'Violence'),
    label('Hate Symbols'),
  ]);
  const res = await m.moderate(KEY);
  assert.equal(res.rejected, true);
  assert.deepEqual([...res.labels].sort(), ['Hate Symbols', 'Violence']);
});

test('BE-04 M-14 수영복 등 다른 라벨은 rejected false', async (t) => {
  const { m } = withLabels(t, [
    label('Swimwear or Underwear'),
    label('Female Swimwear or Underwear', 'Swimwear or Underwear'),
    label('Kissing on the Lips', 'Non-Explicit Nudity of Intimate parts and Kissing'),
    label('Non-Explicit Nudity of Intimate parts and Kissing'),
  ]);
  assert.deepEqual(await m.moderate(KEY), { rejected: false, labels: [] });
});

test('BE-04 M-14 거부 라벨과 다른 라벨이 섞이면 거부 라벨만 labels에 담긴다', async (t) => {
  const { m } = withLabels(t, [label('Swimwear or Underwear'), label('Explicit Nudity', 'Explicit')]);
  assert.deepEqual(await m.moderate(KEY), { rejected: true, labels: ['Explicit'] });
});

test('BE-04 Rekognition 오류면 MODERATION_UNAVAILABLE을 던진다', async (t) => {
  const m = make();
  t.mock.method(m.client, 'send', async () => { throw new Error('ThrottlingException'); });
  await assert.rejects(m.moderate(KEY), (err) => {
    assert.ok(err instanceof AppError);
    assert.equal(err.code, 'MODERATION_UNAVAILABLE');
    assert.equal(err.status, 503);
    return true;
  });
});

test('BE-04 M-09 제한 시간을 넘으면 요청을 중단하고 MODERATION_UNAVAILABLE을 던진다', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const m = make();
  let signal;
  t.mock.method(m.client, 'send', (cmd, { abortSignal }) => {
    signal = abortSignal;
    return new Promise((_, reject) => abortSignal.addEventListener('abort', () => reject(new Error('aborted'))));
  });
  const p = m.moderate(KEY);
  t.mock.timers.tick(M_09_REKOGNITION_TIMEOUT_MS - 1);
  assert.equal(signal.aborted, false);
  t.mock.timers.tick(1);
  assert.equal(signal.aborted, true);
  await assert.rejects(p, { code: 'MODERATION_UNAVAILABLE' });
});

test('BE-04 M-09 제한 시간 안에 응답하면 타이머를 정리해 중단하지 않는다', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const m = make();
  let signal;
  t.mock.method(m.client, 'send', async (cmd, { abortSignal }) => {
    signal = abortSignal;
    return { ModerationLabels: [] };
  });
  assert.deepEqual(await m.moderate(KEY), { rejected: false, labels: [] });
  t.mock.timers.tick(M_09_REKOGNITION_TIMEOUT_MS);
  assert.equal(signal.aborted, false);
});
