import { beforeEach, describe, it, expect, vi } from 'vitest';
import { ApiError, api, handleUnauthorized, messageOf } from './client';
import { log } from '../lib/log';
import { queryClient } from '../queryClient';
import { useSession } from '../stores/session';
import { mockFetch, apiError } from '../test/mockFetch';
import { resetStores } from '../test/render';

beforeEach(() => {
  resetStores();
  queryClient.clear();
  vi.spyOn(log, 'error').mockImplementation(() => {});
  vi.spyOn(log, 'warn').mockImplementation(() => {});
});

async function fail(p: Promise<unknown>): Promise<ApiError> {
  try {
    await p;
  } catch (e) {
    return e as ApiError;
  }
  throw new Error('성공하면 안 됨');
}

describe('api client', () => {
  it('FE-01 credentials same-origin, JSON 헤더·본문', async () => {
    const f = mockFetch([{ method: 'POST', url: '/api/x', reply: { json: { ok: 1 } } }]);
    const res = await api<{ ok: number }>('/api/x', { method: 'POST', body: { a: 1 } });
    expect(res).toEqual({ ok: 1 });
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0].credentials).toBe('same-origin');
    expect(f.calls[0].headers['Content-Type']).toBe('application/json');
    expect(f.calls[0].body).toEqual({ a: 1 });
  });

  it('FE-01 본문 없는 GET은 Content-Type 헤더 없음, 기본 메서드 GET', async () => {
    const f = mockFetch([{ method: 'GET', url: '/api/x', reply: { json: [] } }]);
    await api('/api/x');
    expect(f.calls[0].method).toBe('GET');
    expect(f.calls[0].headers['Content-Type']).toBeUndefined();
  });

  it('FE-01 204는 undefined', async () => {
    mockFetch([{ method: 'POST', url: '/api/auth/logout', reply: { status: 204 } }]);
    expect(await api('/api/auth/logout', { method: 'POST' })).toBeUndefined();
  });

  it('FE-01 AUTH_REQUIRED 401이면 session.logout() 호출, screen=login, nearby 캐시 삭제', async () => {
    mockFetch([{ method: 'GET', url: '/api/x', reply: apiError('AUTH_REQUIRED', 401) }]);
    useSession.getState().setLoggedIn({ id: 'u', email: 'a@b.c' });
    useSession.getState().setScreen('ar');
    queryClient.setQueryData(['nearby'], { capsules: [] });

    const e = await fail(api('/api/x'));

    expect(e).toBeInstanceOf(ApiError);
    expect(e.code).toBe('AUTH_REQUIRED');
    expect(useSession.getState().user).toBeNull();
    expect(useSession.getState().screen).toBe('login');
    expect(queryClient.getQueryData(['nearby'])).toBeUndefined();
  });

  it('FE-01 INVALID_CREDENTIALS 401은 logout을 부르지 않음', async () => {
    mockFetch([{ method: 'POST', url: '/api/auth/login', reply: apiError('INVALID_CREDENTIALS', 401) }]);
    useSession.getState().setScreen('signup');
    const e = await fail(api('/api/auth/login', { method: 'POST', body: { email: 'a', password: 'b' } }));
    expect(e.code).toBe('INVALID_CREDENTIALS');
    expect(e.status).toBe(401);
    expect(useSession.getState().screen).toBe('signup');
  });

  it('FE-10 403 OUT_OF_RANGE의 extra.remaining_m이 ApiError.extra로 전달', async () => {
    mockFetch([{ method: 'POST', url: '/api/capsules/c1/open', reply: apiError('OUT_OF_RANGE', 403, { remaining_m: 7.24 }) }]);
    const e = await fail(api('/api/capsules/c1/open', { method: 'POST', body: {} }));
    expect(e.code).toBe('OUT_OF_RANGE');
    expect(e.status).toBe(403);
    expect(e.extra).toEqual({ remaining_m: 7.24 });
    expect(typeof e.message).toBe('string');
    expect(e.message.length).toBeGreaterThan(0);
  });

  it('FE-01 네트워크 예외는 NETWORK_ERROR(status 0)', async () => {
    mockFetch([{ method: 'GET', url: '/api/x', reply: { networkError: true } }]);
    const e = await fail(api('/api/x'));
    expect(e.code).toBe('NETWORK_ERROR');
    expect(e.status).toBe(0);
    expect(e.message).toBe('네트워크 연결을 확인해 주세요');
  });

  it('FE-01 JSON이 아닌 오류 본문은 UNKNOWN_ERROR(status 유지)', async () => {
    mockFetch([{ method: 'GET', url: '/api/x', reply: { status: 502, text: '<html>bad gateway</html>' } }]);
    const e = await fail(api('/api/x'));
    expect(e.code).toBe('UNKNOWN_ERROR');
    expect(e.status).toBe(502);
    expect(e.message).toBe('잠시 후 다시 시도해 주세요');
  });

  it('FE-01 형식이 다른 JSON 오류 본문도 UNKNOWN_ERROR', async () => {
    mockFetch([{ method: 'GET', url: '/api/x', reply: { status: 500, json: { foo: 1 } } }]);
    const e = await fail(api('/api/x'));
    expect(e.code).toBe('UNKNOWN_ERROR');
    expect(e.status).toBe(500);
  });

  it('FE-01 오류마다 log.error("api", error, { path, status }), 본문·비밀번호는 넘기지 않음', async () => {
    mockFetch([{ method: 'POST', url: '/api/auth/login', reply: apiError('INVALID_CREDENTIALS', 401) }]);
    await fail(api('/api/auth/login', { method: 'POST', body: { email: 'a@b.c', password: 'secret-pw' } }));
    expect(log.error).toHaveBeenCalledTimes(1);
    const args = vi.mocked(log.error).mock.calls[0];
    expect(args[0]).toBe('api');
    expect(args[1]).toBeInstanceOf(ApiError);
    expect(args[2]).toEqual({ path: '/api/auth/login', status: 401 });
    expect(JSON.stringify(args.slice(2))).not.toContain('secret-pw');
  });

  it('FE-01 네트워크 오류도 log.error 호출(status 0)', async () => {
    mockFetch([{ method: 'GET', url: '/api/x', reply: { networkError: true } }]);
    await fail(api('/api/x'));
    expect(vi.mocked(log.error).mock.calls[0][2]).toEqual({ path: '/api/x', status: 0 });
  });

  it('FE-01 /api/me의 401은 정상 분기라 log.warn, log.error 아님', async () => {
    mockFetch([{ method: 'GET', url: '/api/me', reply: apiError('AUTH_REQUIRED', 401) }]);
    await fail(api('/api/me'));
    expect(log.warn).toHaveBeenCalled();
    expect(log.error).not.toHaveBeenCalled();
  });

  it('FE-01 messageOf: ApiError는 message, 그 외는 기본 문구', () => {
    expect(messageOf(new ApiError('NOT_OWNER', '내 캡슐만 삭제할 수 있어요', 403))).toBe('내 캡슐만 삭제할 수 있어요');
    expect(messageOf(new Error('x'))).toBe('잠시 후 다시 시도해 주세요');
    expect(messageOf('str')).toBe('잠시 후 다시 시도해 주세요');
  });

  it('FE-01 ApiError 기본값: extra는 빈 객체', () => {
    const e = new ApiError('UPLOAD_FAILED', '업로드에 실패했어요', 0);
    expect(e).toBeInstanceOf(Error);
    expect(e.extra).toEqual({});
    expect(e.code).toBe('UPLOAD_FAILED');
    expect(e.status).toBe(0);
  });

  it('FE-01 handleUnauthorized는 logout + nearby 캐시 삭제', () => {
    useSession.getState().setLoggedIn({ id: 'u', email: 'a@b.c' });
    queryClient.setQueryData(['nearby'], 1);
    handleUnauthorized();
    expect(useSession.getState().screen).toBe('login');
    expect(queryClient.getQueryData(['nearby'])).toBeUndefined();
  });
});
