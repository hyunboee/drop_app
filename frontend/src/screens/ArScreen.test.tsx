import { beforeEach, describe, it, expect, vi } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import { ArScreen } from './ArScreen';
import { frameState } from '../lib/geo';
import { log } from '../lib/log';
import { useArStore } from '../stores/ar';
import { mockFetch, apiError } from '../test/mockFetch';
import { fireOrientation, mockGeolocation } from '../test/browser';
import { renderWithProviders, resetStores } from '../test/render';
import { nearby, northOf, pos } from '../test/samples';

const NEARBY = /^\/api\/capsules\/nearby\?/;
const EMPTY_TEXT = '주변에 캡슐이 없어요. 첫 캡슐을 남겨 보세요';
const LOADING_TEXT = '주변 확인 중…';
const BANNER_TEXT = 'GPS 정확도가 낮아요. 드롭·열람이 막혀요';
const GEO_ERROR_TEXT = '위치를 가져올 수 없어요';

const emit = (geo: ReturnType<typeof mockGeolocation>, p = pos()) => act(() => geo.emit(p));
const fab = () => screen.getByRole('button', { name: '메뉴 열기' });

function setup(reply: Parameters<typeof mockFetch>[0][number]['reply'] = { json: { capsules: [] } }) {
  const geo = mockGeolocation();
  const f = mockFetch([{ method: 'GET', url: NEARBY, reply }]);
  const view = renderWithProviders(<ArScreen />);
  return { geo, f, ...view };
}

beforeEach(() => {
  resetStores();
  vi.spyOn(log, 'error').mockImplementation(() => {});
  vi.spyOn(log, 'warn').mockImplementation(() => {});
});

describe('ArScreen 위치·방향 수집 (FE-06)', () => {
  it('FE-06 FR-09 마운트 시 고정밀 watchPosition을 시작하고 위치를 스토어에 저장', () => {
    const { geo } = setup();
    expect(geo.watchPosition).toHaveBeenCalledTimes(1);
    expect(geo.watchPosition.mock.calls[0][2]).toMatchObject({ enableHighAccuracy: true });
    emit(geo, pos({ lat: 37.5, lng: 127, accuracy: 12 }));
    expect(useArStore.getState().position).toEqual({ lat: 37.5, lng: 127, accuracy: 12 });
  });

  it('FE-06 언마운트 시 clearWatch와 방향 리스너 제거', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const { geo, unmount } = setup();
    const added = add.mock.calls.filter(([t]) => t === 'deviceorientation' || t === 'deviceorientationabsolute');
    expect(added.map(([t]) => t).sort()).toEqual(['deviceorientation', 'deviceorientationabsolute']);
    unmount();
    expect(geo.clearWatch).toHaveBeenCalledWith(1);
    for (const [type, listener] of added) expect(remove).toHaveBeenCalledWith(type, listener);
  });

  it('FE-06 iOS webkitCompassHeading 이벤트가 heading(0~360)으로 저장된다', () => {
    setup();
    act(() => fireOrientation('deviceorientation', { webkitCompassHeading: 90 }));
    expect(useArStore.getState().heading).toBe(90);
    act(() => fireOrientation('deviceorientation', { webkitCompassHeading: 360 }));
    expect(useArStore.getState().heading).toBe(0);
  });

  it('FE-06 Android deviceorientationabsolute(alpha 90)는 heading 270', () => {
    setup();
    act(() => fireOrientation('deviceorientationabsolute', { alpha: 90, absolute: true }));
    expect(useArStore.getState().heading).toBe(270);
  });

  it('FE-06 방향값이 없거나 absolute가 아니면 heading을 바꾸지 않는다', () => {
    setup();
    act(() => fireOrientation('deviceorientation', { alpha: 90, absolute: false }));
    expect(useArStore.getState().heading).toBeNull();
  });
});

describe('ArScreen 정확도 배너 (FE-06)', () => {
  it('FE-06 PRM-03 accuracy 30은 배너 없음, 30.01은 표시, 5로 회복하면 사라짐', () => {
    const { geo } = setup();
    emit(geo, pos({ accuracy: 30 }));
    expect(screen.queryByText(BANNER_TEXT)).toBeNull();
    emit(geo, pos({ accuracy: 30.01 }));
    expect(screen.getByText(BANNER_TEXT)).toBeTruthy();
    emit(geo, pos({ accuracy: 5 }));
    expect(screen.queryByText(BANNER_TEXT)).toBeNull();
  });

  it('FE-06 위치가 아직 없으면 배너 없음', () => {
    setup();
    expect(screen.queryByText(BANNER_TEXT)).toBeNull();
  });

  it('FE-06 PRM-03 배너가 떠 있어도 FAB은 렌더링된다', () => {
    const { geo } = setup();
    emit(geo, pos({ accuracy: 50 }));
    expect(screen.getByText(BANNER_TEXT)).toBeTruthy();
    expect(fab()).toBeTruthy();
  });
});

describe('ArScreen 상태 한 줄 (FE-06)', () => {
  it('FE-06 FAB은 Suspense(ArScene)와 무관하게 첫 렌더부터 보인다', () => {
    setup();
    expect(fab()).toBeTruthy();
  });

  it('FE-06 조회 중이면 "주변 확인 중…", FAB 유지', async () => {
    const { geo } = setup({ json: { capsules: [] }, delayMs: 50 });
    emit(geo);
    expect(await screen.findByText(LOADING_TEXT)).toBeTruthy();
    expect(fab()).toBeTruthy();
    await waitFor(() => expect(screen.queryByText(LOADING_TEXT)).toBeNull());
  });

  it('FE-06 0건이면 빈 상태 문구, FAB 유지', async () => {
    const { geo } = setup();
    emit(geo);
    expect(await screen.findByText(EMPTY_TEXT)).toBeTruthy();
    expect(screen.queryByText(LOADING_TEXT)).toBeNull();
    expect(fab()).toBeTruthy();
  });

  it('FE-06 1건 이상이면 상태 줄이 없다', async () => {
    const { geo } = setup({ json: { capsules: [nearby({ id: 'c1' })] } });
    emit(geo);
    await screen.findByTestId('frame-c1');
    expect(screen.queryByText(EMPTY_TEXT)).toBeNull();
    expect(screen.queryByText(LOADING_TEXT)).toBeNull();
  });

  it('FE-06 조회 오류면 messageOf 문구, FAB 유지', async () => {
    const { geo } = setup(apiError('INTERNAL_ERROR', 500));
    emit(geo);
    expect(await screen.findByText('잠시 후 다시 시도해 주세요')).toBeTruthy();
    expect(screen.queryByText(EMPTY_TEXT)).toBeNull();
    expect(fab()).toBeTruthy();
  });

  it('FE-06 위치 오류면 geoError 문구와 log.error, 조회 오류보다 우선', async () => {
    const { geo } = setup(apiError('INTERNAL_ERROR', 500));
    emit(geo);
    await screen.findByText('잠시 후 다시 시도해 주세요');
    act(() => geo.fail(1));
    expect(screen.getByText(GEO_ERROR_TEXT)).toBeTruthy();
    expect(screen.queryByText('잠시 후 다시 시도해 주세요')).toBeNull();
    expect(log.error).toHaveBeenCalled();
  });

  it('FE-06 위치 오류는 다음 성공 콜백에서 해제된다', async () => {
    const { geo } = setup();
    act(() => geo.fail(2));
    expect(screen.getByText(GEO_ERROR_TEXT)).toBeTruthy();
    emit(geo);
    expect(screen.queryByText(GEO_ERROR_TEXT)).toBeNull();
    expect(await screen.findByText(EMPTY_TEXT)).toBeTruthy();
  });
});

describe('ArScreen 주변 조회·ArScene 연결 (FE-06·FE-07)', () => {
  it('FE-06 위치 없이는 조회하지 않고 ArScene에 프레임이 없다', async () => {
    const { f } = setup({ json: { capsules: [nearby({ id: 'c1' })] } });
    await act(async () => {});
    expect(f.calls).toHaveLength(0);
    expect(screen.queryByTestId('frame-c1')).toBeNull();
  });

  it('FE-07 FR-09 스텁의 data-openable/data-remaining-label이 frameState와 일치(반경 안 1·밖 1)', async () => {
    const here = pos();
    const near = nearby({ id: 'near', title: '가까운', ...here });
    const far = nearby({ id: 'far', title: '먼', ...northOf(here, 40.5) });
    const { geo } = setup({ json: { capsules: [near, far] } });
    emit(geo, here);
    const nearEl = await screen.findByTestId('frame-near');
    const farEl = await screen.findByTestId('frame-far');

    const nearState = frameState(near, here);
    const farState = frameState(far, here);
    expect(nearState.openable).toBe(true);
    expect(farState.openable).toBe(false);

    expect(nearEl.getAttribute('data-openable')).toBe('true');
    expect(nearEl.getAttribute('data-remaining-label')).toBe('');
    expect(farEl.getAttribute('data-openable')).toBe('false');
    expect(farEl.getAttribute('data-remaining-label')).toBe(farState.remainingLabel);
    expect(farEl.getAttribute('data-remaining-label')).toMatch(/^\d+m 남음$/);
    expect(nearEl.textContent).toBe('가까운');
  });

  it('FE-07 위치가 바뀌면 프레임 openable이 새 위치 기준으로 갱신된다', async () => {
    const here = pos();
    const far = nearby({ id: 'far', ...northOf(here, 100) });
    const { geo } = setup({ json: { capsules: [far] } });
    emit(geo, here);
    const el = await screen.findByTestId('frame-far');
    expect(el.getAttribute('data-openable')).toBe('false');
    emit(geo, pos(northOf(here, 100)));
    await waitFor(() => expect(screen.getByTestId('frame-far').getAttribute('data-openable')).toBe('true'));
    expect(screen.getByTestId('frame-far').getAttribute('data-remaining-label')).toBe('');
  });
});
