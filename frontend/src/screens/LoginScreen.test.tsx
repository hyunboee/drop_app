import { beforeEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { LoginScreen } from './LoginScreen';
import { log } from '../lib/log';
import { useSession } from '../stores/session';
import { mockFetch, apiError } from '../test/mockFetch';
import { renderWithProviders, resetStores } from '../test/render';

const USER = { id: 'u1', email: 'a@b.c' };

function fill(email = 'a@b.c', password = 'password1') {
  fireEvent.change(screen.getByLabelText('이메일'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: password } });
}

const loginButton = () => screen.getByRole('button', { name: '로그인' }) as HTMLButtonElement;

beforeEach(() => {
  resetStores();
  vi.spyOn(log, 'error').mockImplementation(() => {});
  vi.spyOn(log, 'warn').mockImplementation(() => {});
});

describe('LoginScreen', () => {
  it('FE-02 입력 라벨·버튼·가입 안내 문구를 보여 준다', () => {
    renderWithProviders(<LoginScreen />);
    expect((screen.getByLabelText('비밀번호') as HTMLInputElement).type).toBe('password');
    expect(screen.getByLabelText('이메일')).toBeTruthy();
    expect(screen.getByText('계정이 없나요?')).toBeTruthy();
    expect(screen.getByRole('button', { name: '가입하기' })).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('FE-02 로그인 성공 시 요청 본문 {email,password}, session.user 설정, screen=start', async () => {
    const f = mockFetch([{ method: 'POST', url: '/api/auth/login', reply: { json: USER } }]);
    renderWithProviders(<LoginScreen />);
    fill();
    fireEvent.click(loginButton());
    await waitFor(() => expect(useSession.getState().screen).toBe('start'));
    expect(useSession.getState().user).toEqual(USER);
    expect(f.callsTo('POST', '/api/auth/login')[0].body).toEqual({ email: 'a@b.c', password: 'password1' });
  });

  it('FE-02 Enter(폼 제출)로도 로그인된다', async () => {
    const f = mockFetch([{ method: 'POST', url: '/api/auth/login', reply: { json: USER } }]);
    renderWithProviders(<LoginScreen />);
    fill();
    fireEvent.submit(screen.getByLabelText('이메일').closest('form')!);
    await waitFor(() => expect(useSession.getState().screen).toBe('start'));
    expect(f.callsTo('POST', '/api/auth/login')).toHaveLength(1);
  });

  it('FE-02 401 INVALID_CREDENTIALS는 서버 문구를 보여 주고 로그인 상태가 아니다', async () => {
    mockFetch([{ method: 'POST', url: '/api/auth/login', reply: apiError('INVALID_CREDENTIALS', 401) }]);
    renderWithProviders(<LoginScreen />);
    fill();
    fireEvent.click(loginButton());
    expect((await screen.findByRole('alert')).textContent).toBe('이메일 또는 비밀번호가 맞지 않아요');
    expect(useSession.getState().user).toBeNull();
    expect(useSession.getState().screen).toBe('login');
  });

  it('FE-02 429 ACCOUNT_LOCKED는 잠금 문구, 401 문구와 서로 다르다', async () => {
    mockFetch([{ method: 'POST', url: '/api/auth/login', reply: apiError('ACCOUNT_LOCKED', 429) }]);
    renderWithProviders(<LoginScreen />);
    fill();
    fireEvent.click(loginButton());
    const text = (await screen.findByRole('alert')).textContent;
    expect(text).toBe('로그인 시도가 많아 잠시 후 다시 시도해 주세요');
    expect(text).not.toBe('이메일 또는 비밀번호가 맞지 않아요');
  });

  it('FE-02 네트워크 오류 메시지를 화면에 표시하고 log.error를 호출', async () => {
    mockFetch([{ method: 'POST', url: '/api/auth/login', reply: { networkError: true } }]);
    renderWithProviders(<LoginScreen />);
    fill();
    fireEvent.click(loginButton());
    expect((await screen.findByRole('alert')).textContent).toBe('네트워크 연결을 확인해 주세요');
    expect(log.error).toHaveBeenCalled();
  });

  it('FE-02 요청 대기 중 로그인 버튼 disabled + aria-busy, 연속 클릭해도 요청 1회', async () => {
    const f = mockFetch([{ method: 'POST', url: '/api/auth/login', reply: { json: USER, delayMs: 50 } }]);
    renderWithProviders(<LoginScreen />);
    fill();
    fireEvent.click(loginButton());
    await waitFor(() => expect(loginButton().disabled).toBe(true));
    expect(loginButton().getAttribute('aria-busy')).toBe('true');
    fireEvent.click(loginButton());
    fireEvent.click(loginButton());
    await waitFor(() => expect(useSession.getState().screen).toBe('start'));
    expect(f.callsTo('POST', '/api/auth/login')).toHaveLength(1);
  });

  it('FE-02 "가입하기"를 누르면 screen=signup', () => {
    renderWithProviders(<LoginScreen />);
    fireEvent.click(screen.getByRole('button', { name: '가입하기' }));
    expect(useSession.getState().screen).toBe('signup');
  });
});
