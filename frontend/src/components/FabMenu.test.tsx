import { beforeEach, describe, it, expect, vi } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { FabMenu } from './FabMenu';
import { useNearbyCapsules } from '../api/capsules';
import { log } from '../lib/log';
import { useArStore } from '../stores/ar';
import { useSession } from '../stores/session';
import { mockFetch, apiError } from '../test/mockFetch';
import { renderWithProviders, resetStores } from '../test/render';
import { nearby, pos } from '../test/samples';

const NEARBY = /^\/api\/capsules\/nearby\?/;

// 주변 조회 쿼리를 활성 상태로 만들어 재조회를 관찰한다
function Observer() {
  useNearbyCapsules(useArStore((s) => s.position));
  return null;
}

function setup(over: { onClose?: () => void; onDrop?: (a: unknown) => void; onNotice?: (n: unknown) => void } = {}) {
  const props = { onClose: vi.fn(), onDrop: vi.fn(), onNotice: vi.fn(), ...over };
  renderWithProviders(
    <>
      <Observer />
      <FabMenu {...props} />
    </>,
  );
  return props;
}

beforeEach(() => {
  resetStores();
  vi.spyOn(log, 'error').mockImplementation(() => {});
  vi.spyOn(log, 'warn').mockImplementation(() => {});
});

describe('FabMenu 항목', () => {
  it('FE-08 "주변 스캔"·"여기에 드롭"·"로그아웃" 항목이 보인다', () => {
    mockFetch([]);
    setup();
    expect(screen.getByRole('button', { name: '주변 스캔' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '여기에 드롭' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '로그아웃' })).toBeTruthy();
  });
});

describe('FabMenu 여기에 드롭', () => {
  it('FE-08 FR-03 accuracy 30.01이면 drop_remeasure 안내, onDrop 미호출, 메뉴 닫힘', () => {
    mockFetch([]);
    useArStore.getState().setPosition(pos({ accuracy: 30.01 }));
    const p = setup();
    fireEvent.click(screen.getByRole('button', { name: '여기에 드롭' }));
    expect(p.onNotice).toHaveBeenCalledWith({ kind: 'drop_remeasure' });
    expect(p.onDrop).not.toHaveBeenCalled();
    expect(p.onClose).toHaveBeenCalledTimes(1);
  });

  it('FE-08 FR-03 position이 없어도 drop_remeasure 안내', () => {
    mockFetch([]);
    const p = setup();
    fireEvent.click(screen.getByRole('button', { name: '여기에 드롭' }));
    expect(p.onNotice).toHaveBeenCalledWith({ kind: 'drop_remeasure' });
    expect(p.onDrop).not.toHaveBeenCalled();
    expect(p.onClose).toHaveBeenCalledTimes(1);
  });

  it('FE-08 FR-03 경계: accuracy 30은 드롭 허용, 그 순간의 lat·lng·accuracy·heading이 앵커', () => {
    mockFetch([]);
    useArStore.getState().setPosition({ lat: 37.5, lng: 127.1, accuracy: 30 });
    useArStore.getState().setHeading(123);
    const p = setup();
    fireEvent.click(screen.getByRole('button', { name: '여기에 드롭' }));
    expect(p.onDrop).toHaveBeenCalledWith({ lat: 37.5, lng: 127.1, accuracy: 30, heading: 123 });
    expect(p.onNotice).not.toHaveBeenCalled();
    expect(p.onClose).toHaveBeenCalledTimes(1);
  });

  it('FE-08 heading이 아직 null이면 0으로 저장', () => {
    mockFetch([]);
    useArStore.getState().setPosition(pos());
    const p = setup();
    fireEvent.click(screen.getByRole('button', { name: '여기에 드롭' }));
    expect(p.onDrop).toHaveBeenCalledWith({ lat: 37.5665, lng: 126.978, accuracy: 5, heading: 0 });
  });
});

describe('FabMenu 주변 스캔', () => {
  it('FE-08 FR-09 accuracy 50(경고 중)에서도 /nearby를 즉시 재호출하고 메뉴를 닫는다', async () => {
    const f = mockFetch([
      { method: 'GET', url: NEARBY, reply: [{ json: { capsules: [] } }, { json: { capsules: [nearby()] } }] },
    ]);
    useArStore.getState().setPosition(pos({ accuracy: 50 }));
    const p = setup();
    await waitFor(() => expect(f.callsTo('GET', NEARBY)).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: '주변 스캔' }));
    await waitFor(() => expect(f.callsTo('GET', NEARBY)).toHaveLength(2));
    expect(p.onClose).toHaveBeenCalledTimes(1);
    expect(p.onNotice).not.toHaveBeenCalled();
  });
});

describe('FabMenu 로그아웃', () => {
  it('FE-08 FR-01 로그아웃 204면 screen=login, user=null', async () => {
    useSession.getState().setLoggedIn({ id: 'u1', email: 'a@b.c' });
    const f = mockFetch([{ method: 'POST', url: '/api/auth/logout', reply: { status: 204 } }]);
    setup();
    fireEvent.click(screen.getByRole('button', { name: '로그아웃' }));
    await waitFor(() => expect(useSession.getState().screen).toBe('login'));
    expect(useSession.getState().user).toBeNull();
    expect(f.callsTo('POST', '/api/auth/logout')).toHaveLength(1);
  });

  it('FE-08 FR-01 로그아웃 실패 시 message 안내 + 메뉴 닫기, 로그인 상태 유지', async () => {
    useSession.getState().setLoggedIn({ id: 'u1', email: 'a@b.c' });
    mockFetch([{ method: 'POST', url: '/api/auth/logout', reply: apiError('INTERNAL_ERROR', 500) }]);
    const p = setup();
    fireEvent.click(screen.getByRole('button', { name: '로그아웃' }));
    await waitFor(() =>
      expect(p.onNotice).toHaveBeenCalledWith({ kind: 'message', text: '잠시 후 다시 시도해 주세요' }),
    );
    expect(p.onClose).toHaveBeenCalledTimes(1);
    expect(useSession.getState().user).toEqual({ id: 'u1', email: 'a@b.c' });
    expect(useSession.getState().screen).toBe('start');
  });

  it('FE-08 FR-01 로그아웃 네트워크 오류도 message 안내', async () => {
    useSession.getState().setLoggedIn({ id: 'u1', email: 'a@b.c' });
    mockFetch([{ method: 'POST', url: '/api/auth/logout', reply: { networkError: true } }]);
    const p = setup();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '로그아웃' }));
    });
    await waitFor(() =>
      expect(p.onNotice).toHaveBeenCalledWith({ kind: 'message', text: '네트워크 연결을 확인해 주세요' }),
    );
  });
});
