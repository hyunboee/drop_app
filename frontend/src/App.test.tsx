import { beforeEach, describe, it, expect, vi } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { App } from './App';
import { log } from './lib/log';
import { useSession, type Screen } from './stores/session';
import { mockFetch, apiError } from './test/mockFetch';
import { renderWithProviders, resetStores } from './test/render';

vi.mock('./screens/LoginScreen', async () => {
  const { createElement } = await import('react');
  return { LoginScreen: () => createElement('main', { 'data-screen': 'login' }) };
});
vi.mock('./screens/SignupScreen', async () => {
  const { createElement } = await import('react');
  return { SignupScreen: () => createElement('main', { 'data-screen': 'signup' }) };
});
vi.mock('./screens/StartScreen', async () => {
  const { createElement } = await import('react');
  return { StartScreen: () => createElement('main', { 'data-screen': 'start' }) };
});
vi.mock('./screens/PermissionDeniedScreen', async () => {
  const { createElement } = await import('react');
  return { PermissionDeniedScreen: () => createElement('main', { 'data-screen': 'denied' }) };
});
vi.mock('./screens/ArScreen', async () => {
  const { createElement } = await import('react');
  return { ArScreen: () => createElement('main', { 'data-screen': 'ar' }) };
});

const ME = { id: 'u1', email: 'a@b.c' };

function current(container: HTMLElement) {
  return container.querySelector('[data-screen]')?.getAttribute('data-screen') ?? null;
}

beforeEach(() => {
  resetStores();
  vi.spyOn(log, 'error').mockImplementation(() => {});
  vi.spyOn(log, 'warn').mockImplementation(() => {});
});

describe('App', () => {
  it('FE-01 부팅 시 /api/me 200이면 start', async () => {
    mockFetch([{ method: 'GET', url: '/api/me', reply: { json: ME } }]);
    const { container } = renderWithProviders(<App />);
    await waitFor(() => expect(current(container)).toBe('start'));
  });

  it('FE-01 부팅 시 /api/me 401이면 login', async () => {
    mockFetch([{ method: 'GET', url: '/api/me', reply: apiError('AUTH_REQUIRED', 401) }]);
    const { container } = renderWithProviders(<App />);
    await waitFor(() => expect(current(container)).toBe('login'));
  });

  it('FE-01 응답 전에는 아무 화면도 없음', async () => {
    mockFetch([{ method: 'GET', url: '/api/me', reply: { json: ME, delayMs: 50 } }]);
    const { container } = renderWithProviders(<App />);
    expect(current(container)).toBeNull();
    expect(container.textContent).toBe('');
    await waitFor(() => expect(current(container)).toBe('start'));
  });

  it('FE-01 화면 상태 5개마다 해당 컴포넌트 렌더링', async () => {
    mockFetch([{ method: 'GET', url: '/api/me', reply: apiError('AUTH_REQUIRED', 401) }]);
    const { container } = renderWithProviders(<App />);
    await waitFor(() => expect(current(container)).toBe('login'));
    for (const s of ['signup', 'start', 'denied', 'ar', 'login'] as Screen[]) {
      act(() => useSession.getState().setScreen(s));
      expect(current(container)).toBe(s);
    }
  });

  it('FE-01 네트워크 오류면 메시지와 다시 시도, 클릭 시 /api/me 재호출', async () => {
    let n = 0;
    const f = mockFetch([
      { method: 'GET', url: '/api/me', reply: () => (++n === 1 ? { networkError: true } : { json: ME }) },
    ]);
    const { container } = renderWithProviders(<App />);
    expect(await screen.findByText('네트워크 연결을 확인해 주세요')).toBeTruthy();
    expect(current(container)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    await waitFor(() => expect(current(container)).toBe('start'));
    expect(f.callsTo('GET', '/api/me')).toHaveLength(2);
  });

  it('FE-01 서버 오류(500)도 서버 메시지와 다시 시도를 보여 준다', async () => {
    mockFetch([{ method: 'GET', url: '/api/me', reply: apiError('INTERNAL_ERROR', 500) }]);
    renderWithProviders(<App />);
    expect(await screen.findByText('잠시 후 다시 시도해 주세요')).toBeTruthy();
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeTruthy();
  });

  it('FE-01 localStorage·sessionStorage 접근 없음', async () => {
    const spies = [
      vi.spyOn(Storage.prototype, 'getItem'),
      vi.spyOn(Storage.prototype, 'setItem'),
      vi.spyOn(Storage.prototype, 'removeItem'),
    ];
    mockFetch([{ method: 'GET', url: '/api/me', reply: { json: ME } }]);
    const { container } = renderWithProviders(<App />);
    await waitFor(() => expect(current(container)).toBe('start'));
    for (const s of spies) expect(s).not.toHaveBeenCalled();
  });
});
