import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { useNearbyCapsules, useRefreshNearby } from './capsules';
import { M_02_NEARBY_MIN_INTERVAL_MS } from '../params';
import { log } from '../lib/log';
import { useArStore } from '../stores/ar';
import { useSession } from '../stores/session';
import { mockFetch, apiError } from '../test/mockFetch';
import { renderWithProviders, resetStores } from '../test/render';
import { nearby, pos } from '../test/samples';

const NEARBY = /^\/api\/capsules\/nearby\?/;
const START = new Date(2026, 0, 1, 12, 0, 0).getTime();

function Probe() {
  const position = useArStore((s) => s.position);
  const result = useNearbyCapsules(position);
  const refresh = useRefreshNearby();
  return (
    <div>
      <p data-testid="out">
        {result.capsules.map((c) => c.id).join(',')}|{String(result.isFetching)}|{String(result.isFirstLoad)}|
        {result.error?.code ?? ''}
      </p>
      <button onClick={() => void refresh()}>새로고침</button>
    </div>
  );
}

const out = () => screen.getByTestId('out').textContent;
const move = (p = pos()) => act(() => useArStore.getState().setPosition(p));

beforeEach(() => {
  resetStores();
  vi.spyOn(log, 'error').mockImplementation(() => {});
  vi.spyOn(log, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useNearbyCapsules', () => {
  it('FE-06 위치가 없으면 조회하지 않고 capsules는 []', async () => {
    const f = mockFetch([]);
    renderWithProviders(<Probe />);
    await act(async () => {});
    expect(f.calls).toHaveLength(0);
    expect(out()).toBe('|false|false|');
  });

  it('FE-06 FR-09 위치가 생기면 lat·lng 쿼리로 조회하고 capsules를 반환, 조회 중에는 isFirstLoad', async () => {
    const f = mockFetch([
      { method: 'GET', url: NEARBY, reply: { json: { capsules: [nearby({ id: 'c1' }), nearby({ id: 'c2' })] }, delayMs: 30 } },
    ]);
    renderWithProviders(<Probe />);
    move(pos({ lat: 37.5, lng: 127.1 }));
    await waitFor(() => expect(out()).toBe('|true|true|'));
    await waitFor(() => expect(out()).toBe('c1,c2|false|false|'));
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0].url).toBe('/api/capsules/nearby?lat=37.5&lng=127.1');
  });

  it('FE-06 조회 실패 시 error를 노출하고 capsules는 []', async () => {
    mockFetch([{ method: 'GET', url: NEARBY, reply: apiError('INTERNAL_ERROR', 500) }]);
    renderWithProviders(<Probe />);
    move();
    await waitFor(() => expect(out()).toBe('|false|false|INTERNAL_ERROR'));
  });

  it('FE-06 FR-01 주변 조회 AUTH_REQUIRED 401이면 screen=login', async () => {
    useSession.getState().setLoggedIn({ id: 'u1', email: 'a@b.c' });
    mockFetch([{ method: 'GET', url: NEARBY, reply: apiError('AUTH_REQUIRED', 401) }]);
    renderWithProviders(<Probe />);
    move();
    await waitFor(() => expect(useSession.getState().screen).toBe('login'));
    expect(useSession.getState().user).toBeNull();
  });

  it('FE-06 FR-09 M-02 안에 위치가 3번 바뀌어도 조회는 1회', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(START);
    const f = mockFetch([{ method: 'GET', url: NEARBY, reply: { json: { capsules: [] } } }]);
    renderWithProviders(<Probe />);
    move(pos());
    await waitFor(() => expect(f.callsTo('GET', NEARBY)).toHaveLength(1));
    await waitFor(() => expect(out()).toBe('|false|false|'));
    move(pos({ lat: 37.5666 }));
    move(pos({ lat: 37.5667 }));
    move(pos({ lat: 37.5668 }));
    await act(async () => {});
    expect(f.callsTo('GET', NEARBY)).toHaveLength(1);
  });

  it('FE-06 FR-09 M-02보다 1ms 모자라면 조회하지 않는다', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(START);
    const f = mockFetch([{ method: 'GET', url: NEARBY, reply: { json: { capsules: [] } } }]);
    renderWithProviders(<Probe />);
    move(pos());
    await waitFor(() => expect(out()).toBe('|false|false|'));
    vi.setSystemTime(START + M_02_NEARBY_MIN_INTERVAL_MS - 1);
    move(pos({ lat: 37.5666 }));
    await act(async () => {});
    expect(f.callsTo('GET', NEARBY)).toHaveLength(1);
  });

  it('FE-06 FR-09 경계: 정확히 M-02가 지난 뒤 위치가 갱신되면 최신 위치로 재조회', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(START);
    const f = mockFetch([{ method: 'GET', url: NEARBY, reply: { json: { capsules: [] } } }]);
    renderWithProviders(<Probe />);
    move(pos());
    await waitFor(() => expect(out()).toBe('|false|false|'));
    vi.setSystemTime(START + M_02_NEARBY_MIN_INTERVAL_MS);
    move(pos({ lat: 37.5666, lng: 126.979 }));
    await waitFor(() => expect(f.callsTo('GET', NEARBY)).toHaveLength(2));
    expect(f.calls[1].url).toBe('/api/capsules/nearby?lat=37.5666&lng=126.979');
  });

  it('FE-06 FR-09 M-02를 크게 넘긴 뒤 위치가 갱신되면 2회째 조회', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(START);
    const f = mockFetch([{ method: 'GET', url: NEARBY, reply: { json: { capsules: [] } } }]);
    renderWithProviders(<Probe />);
    move(pos());
    await waitFor(() => expect(out()).toBe('|false|false|'));
    vi.setSystemTime(START + 5 * M_02_NEARBY_MIN_INTERVAL_MS);
    move(pos({ lat: 37.5666 }));
    await waitFor(() => expect(f.callsTo('GET', NEARBY)).toHaveLength(2));
  });

  it('FE-06 FR-09 실패 후에도 M-02 안에서는 재조회하지 않는다(오류 시각 기준)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(START);
    const f = mockFetch([{ method: 'GET', url: NEARBY, reply: apiError('INTERNAL_ERROR', 500) }]);
    renderWithProviders(<Probe />);
    move(pos());
    await waitFor(() => expect(out()).toBe('|false|false|INTERNAL_ERROR'));
    move(pos({ lat: 37.5666 }));
    await act(async () => {});
    expect(f.callsTo('GET', NEARBY)).toHaveLength(1);
  });
});

describe('useRefreshNearby', () => {
  it('FE-08 FR-09 M-02 안이어도 즉시 재조회한다', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(START);
    const f = mockFetch([
      { method: 'GET', url: NEARBY, reply: [{ json: { capsules: [] } }, { json: { capsules: [nearby({ id: 'new' })] } }] },
    ]);
    renderWithProviders(<Probe />);
    move(pos());
    await waitFor(() => expect(out()).toBe('|false|false|'));
    fireEvent.click(screen.getByRole('button', { name: '새로고침' }));
    await waitFor(() => expect(out()).toBe('new|false|false|'));
    expect(f.callsTo('GET', NEARBY)).toHaveLength(2);
  });
});
