import { beforeEach, describe, it, expect, vi, type Mock } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { StartScreen } from './StartScreen';
import { log } from '../lib/log';
import { useArStore } from '../stores/ar';
import { useSession } from '../stores/session';
import { mockCamera, mockGeolocation, mockOrientationPermission } from '../test/browser';
import { renderWithProviders, resetStores } from '../test/render';
import { pos } from '../test/samples';

type Geo = ReturnType<typeof mockGeolocation>;

const startButton = () => screen.getByRole('button', { name: '시작' }) as HTMLButtonElement;

// "시작"을 누르고 위치 요청이 나갈 때까지 기다린 뒤 위치 결과를 준다(방향·카메라 다음에 위치가 호출됨)
async function tapStart(geo: Geo, location: 'granted' | number = 'granted') {
  fireEvent.click(startButton());
  await waitFor(() => expect(geo.getCurrentPosition).toHaveBeenCalled());
  act(() => {
    if (location === 'granted') geo.emit(pos());
    else geo.fail(location);
  });
}

function setup(opts: {
  orientation?: 'granted' | 'denied' | 'absent';
  camera?: 'granted' | 'denied' | 'absent';
}) {
  const geo = mockGeolocation();
  const orientation = mockOrientationPermission(opts.orientation ?? 'granted');
  const camera = mockCamera(opts.camera ?? 'granted');
  renderWithProviders(<StartScreen />);
  return { geo, orientation, camera };
}

const denied = () => [...useArStore.getState().denied].sort();

beforeEach(() => {
  resetStores();
  useSession.getState().setScreen('start');
  vi.spyOn(log, 'warn').mockImplementation(() => {});
  vi.spyOn(log, 'error').mockImplementation(() => {});
});

describe('StartScreen', () => {
  it('FE-03 안내 문구, 세 권한 이름, 시작 버튼을 보여 준다', () => {
    setup({});
    expect(screen.getByText('Drop을 시작하려면 아래 권한이 필요해요')).toBeTruthy();
    expect(screen.getByText('카메라')).toBeTruthy();
    expect(screen.getByText('위치')).toBeTruthy();
    expect(screen.getByText('방향 센서')).toBeTruthy();
    expect(startButton().disabled).toBe(false);
  });

  it('FE-03 FR-02 세 권한 모두 허용이면 screen=ar, position 저장, 카메라 트랙 stop 호출', async () => {
    const { geo, camera } = setup({});
    await tapStart(geo);
    await waitFor(() => expect(useSession.getState().screen).toBe('ar'));
    expect(useArStore.getState().position).toEqual(pos());
    expect(useArStore.getState().denied).toEqual([]);
    expect(camera.stopSpy).toHaveBeenCalledTimes(1);
    expect(geo.getCurrentPosition.mock.calls[0][2]).toMatchObject({ enableHighAccuracy: true });
  });

  it('FE-03 FR-02 카메라 거부 → denied, 카메라만 거부 목록', async () => {
    const { geo } = setup({ camera: 'denied' });
    await tapStart(geo);
    await waitFor(() => expect(useSession.getState().screen).toBe('denied'));
    expect(denied()).toEqual(['camera']);
  });

  it('FE-03 FR-02 카메라 장치가 없으면(mediaDevices 없음) camera 거부', async () => {
    const { geo } = setup({ camera: 'absent' });
    await tapStart(geo);
    await waitFor(() => expect(useSession.getState().screen).toBe('denied'));
    expect(denied()).toEqual(['camera']);
  });

  it('FE-03 FR-02 위치 거부(code 1) → denied, 위치만 거부 목록', async () => {
    const { geo } = setup({});
    await tapStart(geo, 1);
    await waitFor(() => expect(useSession.getState().screen).toBe('denied'));
    expect(denied()).toEqual(['location']);
    expect(useArStore.getState().position).toBeNull();
  });

  it('FE-03 FR-02 위치 타임아웃(code 3)도 location 거부', async () => {
    const { geo } = setup({});
    await tapStart(geo, 3);
    await waitFor(() => expect(useSession.getState().screen).toBe('denied'));
    expect(denied()).toEqual(['location']);
  });

  it('FE-03 FR-02 방향 거부(iOS requestPermission denied) → denied', async () => {
    const { geo, orientation } = setup({ orientation: 'denied' });
    await tapStart(geo);
    await waitFor(() => expect(useSession.getState().screen).toBe('denied'));
    expect(denied()).toEqual(['orientation']);
    expect(orientation.requestPermission).toHaveBeenCalledTimes(1);
  });

  it('FE-03 FR-02 requestPermission이 예외를 던져도 orientation 거부', async () => {
    const { geo, orientation } = setup({});
    (orientation.requestPermission as Mock).mockRejectedValue(new Error('boom'));
    await tapStart(geo);
    await waitFor(() => expect(useSession.getState().screen).toBe('denied'));
    expect(denied()).toEqual(['orientation']);
    expect(log.error).toHaveBeenCalled();
  });

  it('FE-03 FR-02 복수 거부여도 요청은 끝까지 수행하고 거부를 모두 기록', async () => {
    const { geo, orientation, camera } = setup({ orientation: 'denied', camera: 'denied' });
    await tapStart(geo, 1);
    await waitFor(() => expect(useSession.getState().screen).toBe('denied'));
    expect(denied()).toEqual(['camera', 'location', 'orientation']);
    expect(orientation.requestPermission).toHaveBeenCalled();
    expect(camera.stopSpy).not.toHaveBeenCalled();
    expect(geo.getCurrentPosition).toHaveBeenCalled();
  });

  it('FE-03 FR-02 requestPermission이 없으면(Android) 호출 없이 통과', async () => {
    const { geo, orientation } = setup({ orientation: 'absent' });
    await tapStart(geo);
    await waitFor(() => expect(useSession.getState().screen).toBe('ar'));
    expect(orientation.requestPermission).toBeUndefined();
    expect(useArStore.getState().denied).toEqual([]);
  });

  it('FE-03 FR-02 DeviceOrientationEvent 자체가 없는 환경도 허용으로 간주', async () => {
    const geo = mockGeolocation();
    mockCamera('granted');
    mockOrientationPermission('absent');
    vi.stubGlobal('DeviceOrientationEvent', undefined);
    renderWithProviders(<StartScreen />);
    await tapStart(geo);
    await waitFor(() => expect(useSession.getState().screen).toBe('ar'));
  });

  it('FE-03 FR-02 방향 요청이 카메라·위치 요청보다 먼저, 순서대로 호출', async () => {
    const { geo, orientation } = setup({});
    await tapStart(geo);
    await waitFor(() => expect(useSession.getState().screen).toBe('ar'));
    const getUserMedia = navigator.mediaDevices.getUserMedia as Mock;
    const order = (m: Mock) => m.mock.invocationCallOrder[0];
    expect(order(orientation.requestPermission as Mock)).toBeLessThan(order(getUserMedia));
    expect(order(getUserMedia)).toBeLessThan(order(geo.getCurrentPosition));
  });

  it('FE-03 요청 중 시작 버튼 disabled + aria-busy, 연속 클릭해도 위치 요청 1회', async () => {
    const { geo } = setup({});
    fireEvent.click(startButton());
    await waitFor(() => expect(geo.getCurrentPosition).toHaveBeenCalled());
    expect(startButton().disabled).toBe(true);
    expect(startButton().getAttribute('aria-busy')).toBe('true');
    fireEvent.click(startButton());
    expect(geo.getCurrentPosition).toHaveBeenCalledTimes(1);
    act(() => geo.emit(pos()));
    await waitFor(() => expect(useSession.getState().screen).toBe('ar'));
  });
});
