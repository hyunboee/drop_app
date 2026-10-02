import type { ReactNode } from 'react';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCreateCapsule, useDeleteCapsule, useNearbyCapsules, useOpenCapsule } from './capsules';
import { log } from '../lib/log';
import { useArStore } from '../stores/ar';
import { mockFetch, apiError } from '../test/mockFetch';
import { resetStores } from '../test/render';
import { nearby, pos } from '../test/samples';

const NEARBY = /^\/api\/capsules\/nearby\?/;
const EXPIRES = new Date(2026, 10, 30, 12).toISOString();
const CREATE_VARS = { media_id: 'm1', title: '제목', lat: 37.5, lng: 127.1, accuracy: 8, heading: 90 };

// 주변 조회 쿼리를 활성 상태로 두고 mutation 훅을 함께 쓴다
function setup<T>(useMutationHook: () => T) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(
    () => {
      useNearbyCapsules(useArStore((s) => s.position));
      return useMutationHook();
    },
    { wrapper },
  );
}

async function settle<V>(call: () => Promise<V>) {
  let error: unknown;
  let value: V | undefined;
  await act(async () => {
    try {
      value = await call();
    } catch (e) {
      error = e;
    }
  });
  return { value, error };
}

beforeEach(() => {
  resetStores();
  useArStore.getState().setPosition(pos());
  vi.spyOn(log, 'error').mockImplementation(() => {});
  vi.spyOn(log, 'warn').mockImplementation(() => {});
});

describe('useCreateCapsule', () => {
  it.each([201, 200])('FE-10 FR-06 POST /capsules가 %i이면 성공: grade BRONZE를 채우고 nearby 재조회', async (status) => {
    const f = mockFetch([
      { method: 'GET', url: NEARBY, reply: { json: { capsules: [] } } },
      { method: 'POST', url: '/api/capsules', reply: { status, json: { id: 'c9', expires_at: EXPIRES } } },
    ]);
    const hook = setup(() => useCreateCapsule());
    await waitFor(() => expect(f.callsTo('GET', NEARBY)).toHaveLength(1));

    const { value, error } = await settle(() => hook.result.current.mutateAsync(CREATE_VARS));
    expect(error).toBeUndefined();
    expect(value).toEqual({ id: 'c9', expires_at: EXPIRES });
    expect(f.callsTo('POST', '/api/capsules')[0].body).toEqual({ ...CREATE_VARS, grade: 'BRONZE' });
    await waitFor(() => expect(f.callsTo('GET', NEARBY)).toHaveLength(2));
  });

  it('FE-10 FR-06 422 MODERATION_REJECTED는 ApiError(code, extra.labels)로 실패', async () => {
    mockFetch([
      { method: 'GET', url: NEARBY, reply: { json: { capsules: [] } } },
      { method: 'POST', url: '/api/capsules', reply: apiError('MODERATION_REJECTED', 422, { labels: ['Explicit'] }) },
    ]);
    const hook = setup(() => useCreateCapsule());
    const { error } = await settle(() => hook.result.current.mutateAsync(CREATE_VARS));
    expect(error).toMatchObject({ code: 'MODERATION_REJECTED', status: 422, extra: { labels: ['Explicit'] } });
  });
});

describe('useOpenCapsule', () => {
  const VARS = { id: 'c1', lat: 37.5, lng: 127.1, accuracy: 8 };

  it('FE-11 FR-10 POST /capsules/:id/open → media_url 반환, 본문은 lat·lng·accuracy만, nearby 재조회 없음', async () => {
    const f = mockFetch([
      { method: 'GET', url: NEARBY, reply: { json: { capsules: [nearby()] } } },
      { method: 'POST', url: '/api/capsules/c1/open', reply: { json: { media_url: '/api/media/m1' } } },
    ]);
    const hook = setup(() => useOpenCapsule());
    await waitFor(() => expect(f.callsTo('GET', NEARBY)).toHaveLength(1));
    const { value } = await settle(() => hook.result.current.mutateAsync(VARS));
    expect(value).toEqual({ media_url: '/api/media/m1' });
    expect(f.callsTo('POST', '/api/capsules/c1/open')[0].body).toEqual({ lat: 37.5, lng: 127.1, accuracy: 8 });
    await act(async () => {});
    expect(f.callsTo('GET', NEARBY)).toHaveLength(1);
  });

  it('FE-11 FR-10 404 CAPSULE_NOT_FOUND면 nearby를 다시 조회', async () => {
    const f = mockFetch([
      { method: 'GET', url: NEARBY, reply: { json: { capsules: [nearby()] } } },
      { method: 'POST', url: '/api/capsules/c1/open', reply: apiError('CAPSULE_NOT_FOUND', 404) },
    ]);
    const hook = setup(() => useOpenCapsule());
    await waitFor(() => expect(f.callsTo('GET', NEARBY)).toHaveLength(1));
    const { error } = await settle(() => hook.result.current.mutateAsync(VARS));
    expect(error).toMatchObject({ code: 'CAPSULE_NOT_FOUND' });
    await waitFor(() => expect(f.callsTo('GET', NEARBY)).toHaveLength(2));
  });

  it('FE-11 FR-10 403 OUT_OF_RANGE는 extra.remaining_m 전달, nearby 재조회 없음', async () => {
    const f = mockFetch([
      { method: 'GET', url: NEARBY, reply: { json: { capsules: [nearby()] } } },
      { method: 'POST', url: '/api/capsules/c1/open', reply: apiError('OUT_OF_RANGE', 403, { remaining_m: 7.24 }) },
    ]);
    const hook = setup(() => useOpenCapsule());
    await waitFor(() => expect(f.callsTo('GET', NEARBY)).toHaveLength(1));
    const { error } = await settle(() => hook.result.current.mutateAsync(VARS));
    expect(error).toMatchObject({ code: 'OUT_OF_RANGE', extra: { remaining_m: 7.24 } });
    await act(async () => {});
    expect(f.callsTo('GET', NEARBY)).toHaveLength(1);
  });
});

describe('useDeleteCapsule', () => {
  it('FE-12 FR-11 DELETE /capsules/:id 204면 성공하고 nearby 재조회', async () => {
    const f = mockFetch([
      { method: 'GET', url: NEARBY, reply: [{ json: { capsules: [nearby({ is_mine: true })] } }, { json: { capsules: [] } }] },
      { method: 'DELETE', url: '/api/capsules/c1', reply: { status: 204 } },
    ]);
    const hook = setup(() => useDeleteCapsule());
    await waitFor(() => expect(f.callsTo('GET', NEARBY)).toHaveLength(1));
    const { value, error } = await settle(() => hook.result.current.mutateAsync({ id: 'c1' }));
    expect(error).toBeUndefined();
    expect(value).toBeUndefined();
    expect(f.callsTo('DELETE', '/api/capsules/c1')).toHaveLength(1);
    await waitFor(() => expect(f.callsTo('GET', NEARBY)).toHaveLength(2));
  });

  it.each([
    ['NOT_OWNER', 403],
    ['CAPSULE_NOT_FOUND', 404],
  ])('FE-12 FR-11 %s(%i)는 ApiError로 실패', async (code, status) => {
    mockFetch([
      { method: 'GET', url: NEARBY, reply: { json: { capsules: [] } } },
      { method: 'DELETE', url: '/api/capsules/c1', reply: apiError(code, status) },
    ]);
    const hook = setup(() => useDeleteCapsule());
    const { error } = await settle(() => hook.result.current.mutateAsync({ id: 'c1' }));
    expect(error).toMatchObject({ code, status });
  });
});
