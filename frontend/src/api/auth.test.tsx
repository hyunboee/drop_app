import type { ReactNode } from 'react';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { act, renderHook, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useLogin, useLogout, useMe, useSignup } from './auth';
import { queryClient } from '../queryClient';
import { log } from '../lib/log';
import { useSession } from '../stores/session';
import { mockFetch, apiError } from '../test/mockFetch';
import { renderWithProviders, resetStores } from '../test/render';

function Probe() {
  const me = useMe();
  return (
    <p data-testid="probe">
      {me.status}:{me.data?.email ?? ''}:{me.error?.code ?? ''}
    </p>
  );
}

beforeEach(() => {
  resetStores();
  vi.spyOn(log, 'error').mockImplementation(() => {});
  vi.spyOn(log, 'warn').mockImplementation(() => {});
});

describe('useMe', () => {
  it('FE-01 /api/me 200이면 session.user 설정, screen=start', async () => {
    mockFetch([{ method: 'GET', url: '/api/me', reply: { json: { id: 'u1', email: 'a@b.c' } } }]);
    renderWithProviders(<Probe />);
    await waitFor(() => expect(screen.getByTestId('probe').textContent).toBe('success:a@b.c:'));
    expect(useSession.getState().user).toEqual({ id: 'u1', email: 'a@b.c' });
    expect(useSession.getState().screen).toBe('start');
  });

  it('FE-01 /api/me 401이면 error(AUTH_REQUIRED), user=null, screen=login', async () => {
    mockFetch([{ method: 'GET', url: '/api/me', reply: apiError('AUTH_REQUIRED', 401) }]);
    renderWithProviders(<Probe />);
    await waitFor(() => expect(screen.getByTestId('probe').textContent).toBe('error::AUTH_REQUIRED'));
    expect(useSession.getState().user).toBeNull();
    expect(useSession.getState().screen).toBe('login');
  });

  it('FE-01 네트워크 오류는 error(NETWORK_ERROR), 로그인 상태 변화 없음', async () => {
    mockFetch([{ method: 'GET', url: '/api/me', reply: { networkError: true } }]);
    renderWithProviders(<Probe />);
    await waitFor(() => expect(screen.getByTestId('probe').textContent).toBe('error::NETWORK_ERROR'));
    expect(useSession.getState().user).toBeNull();
  });

  it('FE-01 staleTime Infinity: 같은 client로 다시 마운트해도 재조회 없음', async () => {
    const f = mockFetch([{ method: 'GET', url: '/api/me', reply: { json: { id: 'u1', email: 'a@b.c' } } }]);
    const first = renderWithProviders(<Probe />);
    await waitFor(() => expect(screen.getByTestId('probe').textContent).toBe('success:a@b.c:'));
    first.unmount();
    renderWithProviders(<Probe />, { client: first.client });
    await waitFor(() => expect(screen.getByTestId('probe').textContent).toBe('success:a@b.c:'));
    expect(f.callsTo('GET', '/api/me')).toHaveLength(1);
  });
});

function setupMutation<T>(hook: () => T, client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, ...renderHook(hook, { wrapper }) };
}

const USER = { id: 'u1', email: 'a@b.c' };
const SIGNUP = { email: 'a@b.c', password: 'abcd1234', agree_terms: true, agree_location: true, agree_age: true } as const;

describe('useSignup', () => {
  it('FE-02 가입 성공(201)이면 User를 반환하고 화면 전환 부작용은 없다', async () => {
    const f = mockFetch([{ method: 'POST', url: '/api/auth/signup', reply: { status: 201, json: USER } }]);
    const { result } = setupMutation(() => useSignup());
    let user;
    await act(async () => {
      user = await result.current.mutateAsync(SIGNUP);
    });
    expect(user).toEqual(USER);
    expect(f.callsTo('POST', '/api/auth/signup')[0].body).toEqual(SIGNUP);
    expect(useSession.getState().screen).toBe('login');
    expect(useSession.getState().user).toBeNull();
  });

  it('FE-02 409면 error.code=EMAIL_TAKEN', async () => {
    mockFetch([{ method: 'POST', url: '/api/auth/signup', reply: apiError('EMAIL_TAKEN', 409) }]);
    const { result } = setupMutation(() => useSignup());
    await act(async () => {
      await result.current.mutateAsync(SIGNUP).catch(() => {});
    });
    await waitFor(() => expect(result.current.error?.code).toBe('EMAIL_TAKEN'));
  });
});

describe('useLogin', () => {
  it('FE-02 로그인 성공(200)이면 User를 반환하고 화면 전환 부작용은 없다', async () => {
    mockFetch([{ method: 'POST', url: '/api/auth/login', reply: { json: USER } }]);
    const { result } = setupMutation(() => useLogin());
    let user;
    await act(async () => {
      user = await result.current.mutateAsync({ email: 'a@b.c', password: 'abcd1234' });
    });
    expect(user).toEqual(USER);
    expect(useSession.getState().screen).toBe('login');
  });

  it('FE-02 401 INVALID_CREDENTIALS와 429 ACCOUNT_LOCKED는 code로 구분되고 logout을 부르지 않는다', async () => {
    useSession.getState().setLoggedIn(USER);
    mockFetch([
      {
        method: 'POST',
        url: '/api/auth/login',
        reply: [apiError('INVALID_CREDENTIALS', 401), apiError('ACCOUNT_LOCKED', 429)],
      },
    ]);
    const { result } = setupMutation(() => useLogin());
    await act(async () => {
      await result.current.mutateAsync({ email: 'a@b.c', password: 'x' }).catch(() => {});
    });
    await waitFor(() => expect(result.current.error?.code).toBe('INVALID_CREDENTIALS'));
    await act(async () => {
      await result.current.mutateAsync({ email: 'a@b.c', password: 'x' }).catch(() => {});
    });
    await waitFor(() => expect(result.current.error?.code).toBe('ACCOUNT_LOCKED'));
    expect(useSession.getState().user).toEqual(USER);
  });
});

describe('useLogout', () => {
  it('FE-02 FR-01 성공(204)이면 session.logout()과 nearby 캐시 삭제', async () => {
    useSession.getState().setLoggedIn(USER);
    mockFetch([{ method: 'POST', url: '/api/auth/logout', reply: { status: 204 } }]);
    // 구현이 싱글턴(handleUnauthorized)을 쓰든 useQueryClient를 쓰든 같은 캐시를 보도록 싱글턴을 주입
    const { result } = setupMutation(() => useLogout(), queryClient);
    queryClient.setQueryData(['nearby'], { capsules: [] });
    await act(async () => {
      await result.current.mutateAsync();
    });
    expect(useSession.getState().user).toBeNull();
    expect(useSession.getState().screen).toBe('login');
    expect(queryClient.getQueryData(['nearby'])).toBeUndefined();
  });

  it('FE-02 실패하면 로그인 상태를 유지하고 error를 노출', async () => {
    useSession.getState().setLoggedIn(USER);
    mockFetch([{ method: 'POST', url: '/api/auth/logout', reply: apiError('INTERNAL_ERROR', 500) }]);
    const { result } = setupMutation(() => useLogout());
    await act(async () => {
      await result.current.mutateAsync().catch(() => {});
    });
    await waitFor(() => expect(result.current.error?.code).toBe('INTERNAL_ERROR'));
    expect(useSession.getState().user).toEqual(USER);
    expect(useSession.getState().screen).toBe('start');
  });
});
