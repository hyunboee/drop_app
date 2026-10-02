import { beforeEach, describe, it, expect } from 'vitest';
import { useSession } from './session';
import { resetStores } from '../test/render';

beforeEach(() => resetStores());

describe('session store', () => {
  it('FE-01 초기값은 user=null, screen=login', () => {
    const s = useSession.getState();
    expect(s.user).toBeNull();
    expect(s.screen).toBe('login');
  });

  it('FE-01 setLoggedIn은 user 설정 + screen=start', () => {
    useSession.getState().setLoggedIn({ id: 'u1', email: 'a@b.c' });
    const s = useSession.getState();
    expect(s.user).toEqual({ id: 'u1', email: 'a@b.c' });
    expect(s.screen).toBe('start');
  });

  it('FE-01 setScreen은 screen만 바꾼다', () => {
    useSession.getState().setScreen('signup');
    expect(useSession.getState().screen).toBe('signup');
    expect(useSession.getState().user).toBeNull();
  });

  it('FE-01 logout은 user=null, screen=login', () => {
    useSession.getState().setLoggedIn({ id: 'u1', email: 'a@b.c' });
    useSession.getState().setScreen('ar');
    useSession.getState().logout();
    const s = useSession.getState();
    expect(s.user).toBeNull();
    expect(s.screen).toBe('login');
  });
});
