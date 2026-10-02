import { beforeEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { SignupScreen } from './SignupScreen';
import { log } from '../lib/log';
import { useSession } from '../stores/session';
import { mockFetch, apiError } from '../test/mockFetch';
import { renderWithProviders, resetStores } from '../test/render';

const USER = { id: 'u1', email: 'a@b.c' };
const TERMS = '이용약관·개인정보 처리 동의';
const LOCATION = '위치정보 이용 동의';
const AGE = '만 14세 이상입니다';

const submit = () => screen.getByRole('button', { name: '가입하기' }) as HTMLButtonElement;
const check = (label: string) => fireEvent.click(screen.getByLabelText(label));

function fillText(password = 'abcd1234') {
  fireEvent.change(screen.getByLabelText('이메일'), { target: { value: 'a@b.c' } });
  fireEvent.change(screen.getByLabelText('비밀번호 (8자 이상)'), { target: { value: password } });
}

beforeEach(() => {
  resetStores();
  vi.spyOn(log, 'error').mockImplementation(() => {});
  vi.spyOn(log, 'warn').mockImplementation(() => {});
});

describe('SignupScreen', () => {
  it('FE-02 FR-01 체크 0·1·2개면 비활성, 3개+비밀번호 8자면 활성', () => {
    renderWithProviders(<SignupScreen />);
    fillText();
    expect(submit().disabled).toBe(true);
    check(TERMS);
    expect(submit().disabled).toBe(true);
    check(LOCATION);
    expect(submit().disabled).toBe(true);
    check(AGE);
    expect(submit().disabled).toBe(false);
  });

  it('FE-02 M-10 비밀번호 7자면 3개 체크해도 비활성, 8자가 되면 활성', () => {
    renderWithProviders(<SignupScreen />);
    fillText('abcd123');
    check(TERMS);
    check(LOCATION);
    check(AGE);
    expect(submit().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('비밀번호 (8자 이상)'), { target: { value: 'abcd1234' } });
    expect(submit().disabled).toBe(false);
  });

  it('FE-02 체크를 다시 눌러 해제하면 다시 비활성', () => {
    renderWithProviders(<SignupScreen />);
    fillText();
    check(TERMS);
    check(LOCATION);
    check(AGE);
    check(AGE);
    expect(submit().disabled).toBe(true);
  });

  it('FE-02 FR-01 가입 성공 시 요청 본문(동의 3개 true), session.user 설정, screen=start', async () => {
    const f = mockFetch([{ method: 'POST', url: '/api/auth/signup', reply: { status: 201, json: USER } }]);
    renderWithProviders(<SignupScreen />);
    fillText();
    check(TERMS);
    check(LOCATION);
    check(AGE);
    fireEvent.click(submit());
    await waitFor(() => expect(useSession.getState().screen).toBe('start'));
    expect(useSession.getState().user).toEqual(USER);
    expect(f.callsTo('POST', '/api/auth/signup')[0].body).toEqual({
      email: 'a@b.c',
      password: 'abcd1234',
      agree_terms: true,
      agree_location: true,
      agree_age: true,
    });
  });

  it('FE-02 FR-01 409 EMAIL_TAKEN이면 "이미 가입된 이메일이에요" 표시', async () => {
    mockFetch([{ method: 'POST', url: '/api/auth/signup', reply: apiError('EMAIL_TAKEN', 409) }]);
    renderWithProviders(<SignupScreen />);
    fillText();
    check(TERMS);
    check(LOCATION);
    check(AGE);
    fireEvent.click(submit());
    expect((await screen.findByRole('alert')).textContent).toBe('이미 가입된 이메일이에요');
    expect(useSession.getState().user).toBeNull();
  });

  it('FE-02 400 VALIDATION_FAILED는 서버 문구를 표시', async () => {
    mockFetch([{ method: 'POST', url: '/api/auth/signup', reply: apiError('VALIDATION_FAILED', 400) }]);
    renderWithProviders(<SignupScreen />);
    fillText();
    check(TERMS);
    check(LOCATION);
    check(AGE);
    fireEvent.click(submit());
    expect((await screen.findByRole('alert')).textContent).toBe('입력값을 확인해 주세요');
  });

  it('FE-02 요청 대기 중 가입 버튼 disabled + aria-busy, 연속 클릭해도 요청 1회', async () => {
    const f = mockFetch([{ method: 'POST', url: '/api/auth/signup', reply: { status: 201, json: USER, delayMs: 50 } }]);
    renderWithProviders(<SignupScreen />);
    fillText();
    check(TERMS);
    check(LOCATION);
    check(AGE);
    fireEvent.click(submit());
    await waitFor(() => expect(submit().disabled).toBe(true));
    expect(submit().getAttribute('aria-busy')).toBe('true');
    fireEvent.click(submit());
    await waitFor(() => expect(useSession.getState().screen).toBe('start'));
    expect(f.callsTo('POST', '/api/auth/signup')).toHaveLength(1);
  });

  it('FE-02 Enter(폼 제출)도 조건 충족 시 가입 요청', async () => {
    const f = mockFetch([{ method: 'POST', url: '/api/auth/signup', reply: { status: 201, json: USER } }]);
    renderWithProviders(<SignupScreen />);
    fillText();
    check(TERMS);
    check(LOCATION);
    check(AGE);
    fireEvent.submit(screen.getByLabelText('이메일').closest('form')!);
    await waitFor(() => expect(useSession.getState().screen).toBe('start'));
    expect(f.callsTo('POST', '/api/auth/signup')).toHaveLength(1);
  });

  it('FE-02 조건 미충족 상태에서 폼을 제출해도 요청하지 않는다', () => {
    const f = mockFetch([]);
    renderWithProviders(<SignupScreen />);
    fillText();
    fireEvent.submit(screen.getByLabelText('이메일').closest('form')!);
    expect(f.calls).toHaveLength(0);
  });

  it('FE-02 "전문 보기" 3개, 클릭하면 준비 중 alert', () => {
    const alert = vi.fn();
    vi.stubGlobal('alert', alert);
    renderWithProviders(<SignupScreen />);
    const buttons = screen.getAllByRole('button', { name: '전문 보기' });
    expect(buttons).toHaveLength(3);
    for (const b of buttons) fireEvent.click(b);
    expect(alert).toHaveBeenCalledTimes(3);
    expect(alert).toHaveBeenCalledWith('약관 전문은 준비 중이에요');
  });

  it('FE-02 "‹ 로그인"을 누르면 screen=login', () => {
    useSession.getState().setScreen('signup');
    renderWithProviders(<SignupScreen />);
    fireEvent.click(screen.getByRole('button', { name: '‹ 로그인' }));
    expect(useSession.getState().screen).toBe('login');
  });
});
