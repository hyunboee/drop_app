import { beforeEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { DropStepProgress } from './DropStepProgress';
import { log } from '../lib/log';
import { mockFetch, apiError, type MockReply } from '../test/mockFetch';
import { installFakeCanvas } from '../test/canvas';
import { renderWithProviders, resetStores } from '../test/render';

const HEADERS = { 'Content-Type': 'image/jpeg', 'If-None-Match': '*', 'x-amz-tagging': 'status=pending' };
const target = (url: string) => ({ url, headers: HEADERS });
const UPLOADS = {
  media_id: 'm1',
  original: target('https://s3.example/o'),
  thumb: target('https://s3.example/t'),
};
const RESULT = { id: 'c9', expires_at: new Date(2026, 10, 30, 12).toISOString() };
const ANCHOR = { lat: 37.5, lng: 127.1, accuracy: 8, heading: 90 };
const PUT_OK = /^https:\/\/s3\.example\/[ot]\d?$/;

function routes(capsules: MockReply | MockReply[] = { status: 201, json: RESULT }) {
  return [
    { method: 'POST', url: '/api/uploads', reply: { json: UPLOADS } },
    { method: 'PUT', url: PUT_OK, reply: { status: 200 } },
    { method: 'POST', url: '/api/capsules', reply: capsules },
  ];
}

function setup(over: Partial<Record<'onClose' | 'onReselect' | 'onDone', () => void>> = {}) {
  const props = { onClose: vi.fn(), onReselect: vi.fn(), onDone: vi.fn(), ...over };
  const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' });
  const ui = <DropStepProgress file={file} title="제목" anchor={ANCHOR} {...props} />;
  const view = renderWithProviders(ui);
  return { ...props, ...view, ui };
}

beforeEach(() => {
  resetStores();
  vi.spyOn(log, 'error').mockImplementation(() => {});
  vi.spyOn(log, 'warn').mockImplementation(() => {});
  installFakeCanvas({ width: 4000, height: 3000 });
});

describe('DropStepProgress 성공 흐름', () => {
  it('FE-10 FR-04·FR-06 /uploads → PUT 원본 → PUT 썸네일 → /capsules 순서, 헤더 그대로, 본문 일치, onDone', async () => {
    const f = mockFetch(routes());
    const { onDone } = setup();
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(RESULT));

    expect(f.calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'POST /api/uploads',
      'PUT https://s3.example/o',
      'PUT https://s3.example/t',
      'POST /api/capsules',
    ]);
    const [, putOriginal, putThumb, create] = f.calls;
    for (const put of [putOriginal, putThumb]) {
      expect(put.headers).toEqual(HEADERS);
      expect(put.credentials).toBeUndefined();
      expect(put.body).toBeInstanceOf(Blob);
    }
    expect(create.body).toEqual({
      media_id: 'm1',
      title: '제목',
      grade: 'BRONZE',
      lat: 37.5,
      lng: 127.1,
      accuracy: 8,
      heading: 90,
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('FE-10 업로드 중 "사진 업로드 중…", 게시 중 "검열 확인 중…"', async () => {
    mockFetch([
      { method: 'POST', url: '/api/uploads', reply: { json: UPLOADS } },
      { method: 'PUT', url: PUT_OK, reply: { delayMs: 40 } },
      { method: 'POST', url: '/api/capsules', reply: { status: 201, json: RESULT, delayMs: 40 } },
    ]);
    const { onDone } = setup();
    expect(await screen.findByText('사진 업로드 중…')).toBeTruthy();
    expect(await screen.findByText('검열 확인 중…')).toBeTruthy();
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it('FE-10 /capsules가 200(멱등 재요청)을 반환해도 성공', async () => {
    mockFetch(routes({ status: 200, json: RESULT }));
    const { onDone } = setup();
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(RESULT));
  });

  it('FE-10 마운트 중복 실행 방지: 리렌더해도 /uploads는 1회', async () => {
    const f = mockFetch(routes());
    const { onDone, rerender, ui } = setup();
    rerender(ui);
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(f.callsTo('POST', '/api/uploads')).toHaveLength(1);
    expect(f.callsTo('POST', '/api/capsules')).toHaveLength(1);
  });

  it('FE-10 언마운트 후 도착한 응답은 무시(onDone 미호출)', async () => {
    const f = mockFetch(routes({ status: 201, json: RESULT, delayMs: 50 }));
    const { onDone, unmount } = setup();
    await waitFor(() => expect(f.callsTo('POST', '/api/capsules')).toHaveLength(1));
    unmount();
    await new Promise((r) => setTimeout(r, 120));
    expect(onDone).not.toHaveBeenCalled();
  });
});

describe('DropStepProgress 업로드 실패', () => {
  function uploadRetryRoutes(first: MockReply) {
    let n = 0;
    return [
      {
        method: 'POST',
        url: '/api/uploads',
        reply: () => {
          n += 1;
          return { json: { ...UPLOADS, original: target(`https://s3.example/o${n}`), thumb: target(`https://s3.example/t${n}`) } };
        },
      },
      { method: 'PUT', url: 'https://s3.example/o1', reply: first },
      { method: 'PUT', url: /^https:\/\/s3\.example\/(t1|o2|t2)$/, reply: { status: 200 } },
      { method: 'POST', url: '/api/capsules', reply: { status: 201, json: RESULT } },
    ];
  }

  it('FE-10 PUT 실패(403) → "업로드에 실패했어요" + log.error, 다시 시도는 새 URL로 재업로드(인코딩 재사용)', async () => {
    const canvas = installFakeCanvas({ width: 4000, height: 3000 });
    const f = mockFetch(uploadRetryRoutes({ status: 403 }));
    const { onDone } = setup();
    expect(await screen.findByText('업로드에 실패했어요')).toBeTruthy();
    expect(log.error).toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
    expect(f.callsTo('POST', '/api/capsules')).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(RESULT));
    expect(f.callsTo('POST', '/api/uploads')).toHaveLength(2);
    expect(f.callsTo('PUT', 'https://s3.example/o2')).toHaveLength(1);
    expect(f.callsTo('PUT', 'https://s3.example/t2')).toHaveLength(1);
    expect(canvas.toBlobCalls).toHaveLength(2);
    expect(f.callsTo('POST', '/api/capsules')[0].body).toMatchObject({ media_id: 'm1' });
  });

  it('FE-10 PUT 네트워크 오류도 "업로드에 실패했어요", 취소 → onClose', async () => {
    mockFetch(uploadRetryRoutes({ networkError: true }));
    const { onClose } = setup();
    expect(await screen.findByText('업로드에 실패했어요')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('FE-10 /uploads 자체가 500이어도 "업로드에 실패했어요"와 다시 시도·취소', async () => {
    mockFetch([{ method: 'POST', url: '/api/uploads', reply: apiError('INTERNAL_ERROR', 500) }]);
    setup();
    expect(await screen.findByText('업로드에 실패했어요')).toBeTruthy();
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '취소' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '시트 닫기' })).toBeNull();
  });
});

describe('DropStepProgress 게시 실패', () => {
  it('FE-10 FR-06 422 MODERATION_REJECTED → 서버 문구 + "확인"이 onClose, 재시도 버튼 없음', async () => {
    mockFetch(routes(apiError('MODERATION_REJECTED', 422, { labels: ['Explicit'] })));
    const { onClose } = setup();
    expect(await screen.findByText('올릴 수 없는 사진이에요')).toBeTruthy();
    expect(screen.queryByText('Explicit')).toBeNull();
    expect(screen.queryByRole('button', { name: '다시 시도' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '확인' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(log.error).toHaveBeenCalled();
  });

  it('FE-10 FR-06 503 MODERATION_UNAVAILABLE → 다시 시도는 /uploads 없이 같은 media_id로 게시만', async () => {
    const f = mockFetch(routes([apiError('MODERATION_UNAVAILABLE', 503), { status: 201, json: RESULT }]));
    const { onDone } = setup();
    expect(await screen.findByText('사진 검사를 할 수 없어요. 다시 시도해 주세요')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(RESULT));
    expect(f.callsTo('POST', '/api/uploads')).toHaveLength(1);
    expect(f.callsTo('PUT', PUT_OK)).toHaveLength(2);
    const creates = f.callsTo('POST', '/api/capsules');
    expect(creates).toHaveLength(2);
    expect(creates[1].body).toEqual(creates[0].body);
  });

  it('FE-10 503 후 취소 → onClose', async () => {
    mockFetch(routes(apiError('MODERATION_UNAVAILABLE', 503)));
    const { onClose } = setup();
    await screen.findByText('사진 검사를 할 수 없어요. 다시 시도해 주세요');
    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('FE-10 게시 네트워크 오류 → messageOf 문구, 다시 시도는 게시만', async () => {
    const f = mockFetch(routes([{ networkError: true }, { status: 200, json: RESULT }]));
    const { onDone } = setup();
    expect(await screen.findByText('네트워크 연결을 확인해 주세요')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(RESULT));
    expect(f.callsTo('POST', '/api/uploads')).toHaveLength(1);
    expect(f.callsTo('POST', '/api/capsules')).toHaveLength(2);
  });

  it('FE-10 게시 500 INTERNAL_ERROR → 서버 문구와 다시 시도·취소', async () => {
    mockFetch(routes(apiError('INTERNAL_ERROR', 500)));
    setup();
    expect(await screen.findByText('잠시 후 다시 시도해 주세요')).toBeTruthy();
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '취소' })).toBeTruthy();
  });

  it.each([
    ['VALIDATION_FAILED', 400, '입력값을 확인해 주세요'],
    ['MEDIA_ALREADY_USED', 409, '이미 사용된 미디어예요'],
  ])('FE-10 %s(%i) → "%s" + "사진 다시 선택"이 onReselect', async (code, status, text) => {
    mockFetch(routes(apiError(code, status)));
    const { onReselect } = setup();
    expect(await screen.findByText(text)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '사진 다시 선택' }));
    expect(onReselect).toHaveBeenCalledTimes(1);
  });

  it('FE-10 FR-03 422 LOW_ACCURACY → 재측정 안내 + "확인"이 onClose', async () => {
    mockFetch(routes(apiError('LOW_ACCURACY', 422)));
    const { onClose } = setup();
    expect(await screen.findByText('위치 정확도가 낮아요. 잠시 후 다시 시도해 주세요')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '확인' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('DropStepProgress 인코딩 실패', () => {
  it.each([
    ['decodeFails', { decodeFails: true }],
    ['toBlobNull', { toBlobNull: true }],
  ])('FE-10 FR-04 %s → "사진을 읽을 수 없어요…" + "사진 다시 선택", 서버 호출 없음', async (_, opt) => {
    installFakeCanvas({ width: 4000, height: 3000, ...opt });
    const f = mockFetch([]);
    const { onReselect } = setup();
    expect(await screen.findByText('사진을 읽을 수 없어요. 다른 사진을 선택해 주세요')).toBeTruthy();
    expect(log.error).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '사진 다시 선택' }));
    expect(onReselect).toHaveBeenCalledTimes(1);
    expect(f.calls).toHaveLength(0);
  });
});
