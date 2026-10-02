import type { ReactNode } from 'react';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useUploadMedia } from './uploads';
import { ApiError } from './client';
import { log } from '../lib/log';
import { mockFetch, apiError } from '../test/mockFetch';
import { resetStores } from '../test/render';

const ORIGINAL_HEADERS = { 'Content-Type': 'image/jpeg', 'If-None-Match': '*', 'x-amz-tagging': 'status=pending' };
const THUMB_HEADERS = { 'Content-Type': 'image/jpeg', 'x-amz-tagging': 'status=pending', 'x-extra': 'a' };
const UPLOADS = {
  media_id: 'm1',
  original: { url: 'https://s3.example/o', headers: ORIGINAL_HEADERS },
  thumb: { url: 'https://s3.example/t', headers: THUMB_HEADERS },
};
const PUT = /^https:\/\/s3\.example\/[ot]$/;

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useUploadMedia(), { wrapper });
}

const blobs = () => ({ original: new Blob(['o'], { type: 'image/jpeg' }), thumb: new Blob(['t'], { type: 'image/jpeg' }) });

async function run(hook: ReturnType<typeof setup>) {
  let error: unknown;
  let value: string | undefined;
  await act(async () => {
    try {
      value = await hook.result.current.mutateAsync(blobs());
    } catch (e) {
      error = e;
    }
  });
  return { value, error };
}

beforeEach(() => {
  resetStores();
  vi.spyOn(log, 'error').mockImplementation(() => {});
  vi.spyOn(log, 'warn').mockImplementation(() => {});
});

describe('useUploadMedia', () => {
  it('FE-10 FR-04 POST /uploads 후 원본·썸네일을 응답 헤더 그대로 PUT하고 media_id 반환', async () => {
    const f = mockFetch([
      { method: 'POST', url: '/api/uploads', reply: { json: UPLOADS } },
      { method: 'PUT', url: PUT, reply: { status: 200 } },
    ]);
    const { value, error } = await run(setup());
    expect(error).toBeUndefined();
    expect(value).toBe('m1');

    const [post, putOriginal, putThumb] = f.calls;
    expect(post.method).toBe('POST');
    expect(putOriginal.url).toBe('https://s3.example/o');
    expect(putOriginal.headers).toEqual(ORIGINAL_HEADERS);
    expect(putThumb.url).toBe('https://s3.example/t');
    expect(putThumb.headers).toEqual(THUMB_HEADERS);
    for (const put of [putOriginal, putThumb]) {
      expect(put.credentials).toBeUndefined();
      expect(put.body).toBeInstanceOf(Blob);
    }
    expect((putOriginal.body as Blob).size).toBe(1);
  });

  it('FE-10 PUT이 2xx가 아니면 UPLOAD_FAILED("업로드에 실패했어요", status는 S3 응답 상태)', async () => {
    mockFetch([
      { method: 'POST', url: '/api/uploads', reply: { json: UPLOADS } },
      { method: 'PUT', url: 'https://s3.example/o', reply: { status: 412 } },
      { method: 'PUT', url: 'https://s3.example/t', reply: { status: 200 } },
    ]);
    const { error } = await run(setup());
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: 'UPLOAD_FAILED', message: '업로드에 실패했어요', status: 412 });
  });

  it('FE-10 썸네일 PUT만 실패해도 UPLOAD_FAILED', async () => {
    mockFetch([
      { method: 'POST', url: '/api/uploads', reply: { json: UPLOADS } },
      { method: 'PUT', url: 'https://s3.example/o', reply: { status: 200 } },
      { method: 'PUT', url: 'https://s3.example/t', reply: { status: 403 } },
    ]);
    const { error } = await run(setup());
    expect(error).toMatchObject({ code: 'UPLOAD_FAILED', status: 403 });
  });

  it('FE-10 PUT에서 fetch가 던지면 UPLOAD_FAILED(status 0) + log.error', async () => {
    mockFetch([
      { method: 'POST', url: '/api/uploads', reply: { json: UPLOADS } },
      { method: 'PUT', url: PUT, reply: { networkError: true } },
    ]);
    const { error } = await run(setup());
    expect(error).toMatchObject({ code: 'UPLOAD_FAILED', message: '업로드에 실패했어요', status: 0 });
    expect(log.error).toHaveBeenCalled();
  });

  it('FE-10 POST /uploads 오류는 서버 ApiError 그대로, PUT은 호출하지 않는다', async () => {
    const f = mockFetch([{ method: 'POST', url: '/api/uploads', reply: apiError('INTERNAL_ERROR', 500) }]);
    const { error } = await run(setup());
    expect(error).toMatchObject({ code: 'INTERNAL_ERROR', status: 500 });
    expect(f.calls).toHaveLength(1);
  });
});
