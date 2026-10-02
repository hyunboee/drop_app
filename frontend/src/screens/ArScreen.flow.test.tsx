import { beforeEach, describe, it, expect, vi } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { ArScreen } from './ArScreen';
import { formatRemaining, frameState } from '../lib/geo';
import { log } from '../lib/log';
import { useSession } from '../stores/session';
import { mockFetch, apiError, type MockReply, type MockRoute } from '../test/mockFetch';
import { mockGeolocation } from '../test/browser';
import { installFakeCanvas } from '../test/canvas';
import { renderWithProviders, resetStores } from '../test/render';
import { nearby, northOf, pos } from '../test/samples';
import { lastArSceneProps } from '../test/arSceneStub';
import { distanceM, offsetToLatLng } from '../lib/geo';

const NEARBY = /^\/api\/capsules\/nearby\?/;
const HERE = pos();
const HEADERS = { 'Content-Type': 'image/jpeg', 'If-None-Match': '*', 'x-amz-tagging': 'status=pending' };
const EXPIRES = new Date(2026, 10, 30, 12).toISOString();

const emit = (geo: ReturnType<typeof mockGeolocation>, p = HERE) => act(() => geo.emit(p));
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const noMenu = () => expect(screen.queryByRole('button', { name: '주변 스캔' })).toBeNull();

function setup(capsules: unknown[] = [], extra: MockRoute[] = []) {
  const geo = mockGeolocation();
  const f = mockFetch([{ method: 'GET', url: NEARBY, reply: { json: { capsules } } }, ...extra]);
  const view = renderWithProviders(<ArScreen />);
  return { geo, f, ...view };
}

const dropRoutes = (): MockRoute[] => [
  {
    method: 'POST',
    url: '/api/uploads',
    reply: {
      json: {
        media_id: 'm1',
        original: { url: 'https://s3.example/o', headers: HEADERS },
        thumb: { url: 'https://s3.example/t', headers: HEADERS },
      },
    },
  },
  { method: 'PUT', url: /^https:\/\/s3\.example\/[ot]$/, reply: { status: 200 } },
  { method: 'POST', url: '/api/capsules', reply: { status: 201, json: { id: 'c9', expires_at: EXPIRES } } },
];

const openRoute = (reply: MockReply): MockRoute => ({ method: 'POST', url: '/api/capsules/near/open', reply });

beforeEach(() => {
  resetStores();
  vi.spyOn(log, 'error').mockImplementation(() => {});
  vi.spyOn(log, 'warn').mockImplementation(() => {});
});

describe('ArScreen FAB 메뉴·Notice (FE-08)', () => {
  it('FE-08 FAB 탭 → 메뉴 열림(aria-label 전환), 다시 탭 → 닫힘', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: '메뉴 열기' }));
    expect(screen.getByRole('button', { name: '주변 스캔' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '여기에 드롭' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '로그아웃' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '메뉴 닫기' }));
    noMenu();
    expect(screen.getByRole('button', { name: '메뉴 열기' })).toBeTruthy();
  });

  it('FE-08 FR-09 "주변 스캔"은 즉시 재조회하고 메뉴를 닫는다', async () => {
    const { geo, f } = setup();
    emit(geo);
    await waitFor(() => expect(f.callsTo('GET', NEARBY)).toHaveLength(1));
    click('메뉴 열기');
    click('주변 스캔');
    await waitFor(() => expect(f.callsTo('GET', NEARBY)).toHaveLength(2));
    noMenu();
  });

  it('FE-08 FR-03 accuracy 30.01에서 "여기에 드롭" → 재측정 안내, 시트 없음, 메뉴 닫힘', async () => {
    const { geo } = setup();
    emit(geo, pos({ accuracy: 30.01 }));
    click('메뉴 열기');
    click('여기에 드롭');
    expect(screen.getByText('GPS 정확도가 낮아 드롭할 수 없어요. 잠시 후 다시 시도해 주세요')).toBeTruthy();
    expect(screen.queryByText('1/4')).toBeNull();
    noMenu();
  });

  it('FE-08 FR-03 위치가 아직 없어도 재측정 안내', () => {
    setup();
    click('메뉴 열기');
    click('여기에 드롭');
    expect(screen.getByText('GPS 정확도가 낮아 드롭할 수 없어요. 잠시 후 다시 시도해 주세요')).toBeTruthy();
    expect(screen.queryByText('1/4')).toBeNull();
  });

  it('FE-08 Notice "닫기"를 누르면 사라진다', () => {
    setup();
    click('메뉴 열기');
    click('여기에 드롭');
    click('닫기');
    expect(screen.queryByText('GPS 정확도가 낮아 드롭할 수 없어요. 잠시 후 다시 시도해 주세요')).toBeNull();
  });

  it('FE-08 FR-01 로그아웃 204 → screen=login', async () => {
    useSession.getState().setLoggedIn({ id: 'u1', email: 'a@b.c' });
    setup([], [{ method: 'POST', url: '/api/auth/logout', reply: { status: 204 } }]);
    click('메뉴 열기');
    click('로그아웃');
    await waitFor(() => expect(useSession.getState().screen).toBe('login'));
  });

  it('FE-08 FR-01 로그아웃 실패 → Notice 메시지, 로그인 유지', async () => {
    useSession.getState().setLoggedIn({ id: 'u1', email: 'a@b.c' });
    setup([], [{ method: 'POST', url: '/api/auth/logout', reply: apiError('INTERNAL_ERROR', 500) }]);
    click('메뉴 열기');
    click('로그아웃');
    expect(await screen.findByText('잠시 후 다시 시도해 주세요')).toBeTruthy();
    expect(useSession.getState().user).not.toBeNull();
  });
});

// 드롭 순서: 여기에 드롭 → W-07 사진 → 다음 → W-13 위치·방향 → 여기에 놓기 → W-08 제목 (FE-14)
const pickPhoto = () =>
  fireEvent.change(screen.getByLabelText('사진 선택'), {
    target: { files: [new File(['x'], 'a.jpg', { type: 'image/jpeg' })] },
  });
const toPlacing = () => {
  click('메뉴 열기');
  click('여기에 드롭');
  pickPhoto();
  click('다음');
};
const slider = () => screen.getByLabelText(/방향/) as HTMLInputElement;

describe('ArScreen 드롭 시트 (FE-09·FE-10)', () => {
  it('FE-09 FR-03 accuracy 30은 시트("1/4")가 열린다, "시트 닫기"로 닫힌다', async () => {
    const { geo } = setup();
    emit(geo, pos({ accuracy: 30 }));
    click('메뉴 열기');
    click('여기에 드롭');
    expect(screen.getByText('1/4')).toBeTruthy();
    noMenu();
    click('시트 닫기');
    expect(screen.queryByText('1/4')).toBeNull();
  });

  it('FE-09 시트가 열려 있으면 FAB 탭은 무시된다', () => {
    const { geo } = setup();
    emit(geo);
    click('메뉴 열기');
    click('여기에 드롭');
    fireEvent.click(screen.getByRole('button', { name: '메뉴 열기' }));
    noMenu();
  });

  it('FE-10·FE-14 드롭 전 흐름: 놓은 자리·슬라이더 방향이 앵커로 게시되고, 완료 후 주변 재조회, 확인으로 시트 닫힘', async () => {
    installFakeCanvas({ width: 4000, height: 3000 });
    const { geo, f } = setup([], dropRoutes());
    emit(geo, pos({ lat: 37.5, lng: 127.1, accuracy: 8 }));
    await waitFor(() => expect(f.callsTo('GET', NEARBY)).toHaveLength(1));

    toPlacing();
    // 프레임을 북쪽 6m로 끌고 방향을 45°로 돌려 놓는다
    const placed = northOf({ lat: 37.5, lng: 127.1 }, 6);
    act(() => lastArSceneProps.current!.onPlaceMove!(placed));
    fireEvent.change(slider(), { target: { value: '45' } });
    click('여기에 놓기');
    expect(screen.getByText('2/4')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('제목'), { target: { value: '우리 동네' } });
    click('드롭하기');

    expect(await screen.findByText('4/4')).toBeTruthy();
    expect(screen.getByText('11월 30일까지 보여요')).toBeTruthy();
    expect(f.callsTo('POST', '/api/capsules')[0].body).toEqual({
      media_id: 'm1',
      title: '우리 동네',
      grade: 'BRONZE',
      lat: expect.closeTo(placed.lat, 9),
      lng: expect.closeTo(placed.lng, 9),
      accuracy: 8,
      heading: 45,
      user_lat: 37.5,
      user_lng: 127.1,
    });
    await waitFor(() => expect(f.callsTo('GET', NEARBY)).toHaveLength(2));

    click('확인');
    expect(screen.queryByText('4/4')).toBeNull();
    expect(screen.getByRole('button', { name: '메뉴 열기' })).toBeTruthy();
  });
});

describe('ArScreen 드롭 위치·방향 정하기 (FE-13·FE-14)', () => {
  const placeFrame = () => screen.getByTestId('place-frame');
  const framePos = () => ({ lat: Number(placeFrame().dataset.lat), lng: Number(placeFrame().dataset.lng) });
  const confirmButton = () => screen.getByRole('button', { name: '여기에 놓기' }) as HTMLButtonElement;

  it('FE-14 FR-03 사진을 고르고 "다음" → 시트를 숨기고 W-13, 미리보기에 고른 사진, FAB 숨김', () => {
    const { geo } = setup();
    emit(geo);
    toPlacing();
    expect(screen.getByText('프레임을 끌어 놓을 곳을 정하세요')).toBeTruthy();
    expect(screen.getByText('내 위치에서 3m')).toBeTruthy();
    expect(screen.queryByText('2/4')).toBeNull();
    expect(screen.queryByRole('button', { name: '메뉴 열기' })).toBeNull();
    expect(distanceM(HERE, framePos())).toBeCloseTo(3, 1);
    expect(lastArSceneProps.current!.placeImage).toMatch(/^blob:/);
  });

  it('FE-14 W-13 "취소"는 시트까지 닫고 W-05로 돌아간다', () => {
    const { geo } = setup();
    emit(geo);
    toPlacing();
    click('취소');
    expect(screen.queryByTestId('place-frame')).toBeNull();
    expect(screen.queryByText('1/4')).toBeNull();
    expect(screen.queryByText('2/4')).toBeNull();
    expect(screen.getByRole('button', { name: '메뉴 열기' })).toBeTruthy();
  });

  it('FE-14 슬라이더를 움직이기 전에는 프레임이 나를 바라본다(동쪽 5m → 270°), 움직인 뒤에는 끌어도 유지', () => {
    const { geo } = setup();
    emit(geo);
    toPlacing();
    expect(slider().value).toBe('180'); // 처음엔 북쪽 3m → 남쪽(나)을 본다
    act(() => lastArSceneProps.current!.onPlaceMove!(offsetToLatLng(HERE, 5, 0)));
    expect(slider().value).toBe('270');
    expect(lastArSceneProps.current!.placeHeading).toBe(270);
    fireEvent.change(slider(), { target: { value: '10' } });
    act(() => lastArSceneProps.current!.onPlaceMove!(northOf(HERE, 5)));
    expect(slider().value).toBe('10');
  });

  it('FE-14 위치를 정한 뒤 W-08 "이전" → W-07 "다음"은 W-13 없이 W-08로 간다', () => {
    const { geo } = setup();
    emit(geo);
    toPlacing();
    click('여기에 놓기');
    click('‹ 이전');
    click('다음');
    expect(screen.getByText('2/4')).toBeTruthy();
    expect(screen.queryByTestId('place-frame')).toBeNull();
  });

  it('FE-13 PRM-20 반경 밖으로 끌면 같은 방향 10m 경계에서 멈춘다', () => {
    const { geo } = setup();
    emit(geo);
    toPlacing();
    act(() => lastArSceneProps.current!.onPlaceMove!(northOf(HERE, 30)));
    expect(distanceM(HERE, framePos())).toBeCloseTo(10, 1);
    expect(framePos().lng).toBeCloseTo(HERE.lng, 9);
    expect(screen.getByText('내 위치에서 10m')).toBeTruthy();
    expect(confirmButton().disabled).toBe(false);
  });

  it('FE-13 정한 뒤 걸어서 10m를 넘게 멀어지면 "여기에 놓기" 비활성 + 안내', () => {
    const { geo } = setup();
    emit(geo);
    toPlacing();
    act(() => lastArSceneProps.current!.onPlaceMove!(northOf(HERE, 8)));
    emit(geo, pos(northOf(HERE, -5)));
    expect(confirmButton().disabled).toBe(true);
    expect(screen.getByText('내 위치에서 10m 안에만 놓을 수 있어요')).toBeTruthy();
  });

  it('FE-13 FR-03 놓는 순간 정확도가 나쁘면 제목 단계로 가지 않고 드롭 재측정 안내', () => {
    const { geo } = setup();
    emit(geo);
    toPlacing();
    emit(geo, pos({ accuracy: 30.01 }));
    click('여기에 놓기');
    expect(screen.getByText('GPS 정확도가 낮아 드롭할 수 없어요. 잠시 후 다시 시도해 주세요')).toBeTruthy();
    expect(screen.queryByText('2/4')).toBeNull();
  });
});

describe('ArScreen 열람 (FE-11)', () => {
  const near = nearby({ id: 'near', title: '가까운', ...HERE });
  const far = nearby({ id: 'far', title: '먼', ...northOf(HERE, 40.5) });

  it('FE-11 PRD7 반경 밖 프레임 탭 → /open 호출 없이 남은 거리 안내', async () => {
    const { geo, f } = setup([far]);
    emit(geo);
    fireEvent.click(await screen.findByTestId('frame-far'));
    const remaining = formatRemaining(frameState(far, HERE).remainingM);
    expect(screen.getByText(remaining).textContent).toMatch(/^\d+m$/);
    expect(document.body.textContent).toContain(`${remaining} 더 가까이 가야 열 수 있어요`);
    expect(f.callsTo('POST', /\/open$/)).toHaveLength(0);
  });

  it('FE-11 FR-03 accuracy 30.01이면 반경 안 프레임도 /open 없이 재측정 안내', async () => {
    const { geo, f } = setup([near]);
    emit(geo, pos({ accuracy: 30.01 }));
    fireEvent.click(await screen.findByTestId('frame-near'));
    expect(screen.getByText('GPS 정확도가 낮아 열 수 없어요. 잠시 후 다시 시도해 주세요')).toBeTruthy();
    expect(f.callsTo('POST', /\/open$/)).toHaveLength(0);
  });

  it('FE-11 FR-10 반경 안 탭 → 로딩 → 이미지·제목, 탭 시점 좌표로 요청, FAB 가림', async () => {
    const { geo, f } = setup([near], [openRoute({ json: { media_url: '/api/media/m1' }, delayMs: 40 })]);
    emit(geo, pos({ ...HERE, accuracy: 7 }));
    fireEvent.click(await screen.findByTestId('frame-near'));
    expect(screen.getByRole('status', { name: '열람 확인 중' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '메뉴 열기' })).toBeNull();

    const img = await screen.findByAltText('가까운');
    expect(img.getAttribute('src')).toBe('/api/media/m1');
    expect(f.callsTo('POST', '/api/capsules/near/open')[0].body).toEqual({ lat: HERE.lat, lng: HERE.lng, accuracy: 7 });
  });

  it('FE-11 "열람 닫기" → OpenView 사라지고 FAB 복귀', async () => {
    const { geo } = setup([near], [openRoute({ json: { media_url: '/api/media/m1' } })]);
    emit(geo);
    fireEvent.click(await screen.findByTestId('frame-near'));
    await screen.findByAltText('가까운');
    click('열람 닫기');
    expect(screen.queryByAltText('가까운')).toBeNull();
    expect(screen.getByRole('button', { name: '메뉴 열기' })).toBeTruthy();
  });

  it('FE-11 FR-10 403 OUT_OF_RANGE remaining_m=7.24 → "8m 더 가까이 가야 열 수 있어요"', async () => {
    const { geo } = setup([near], [openRoute(apiError('OUT_OF_RANGE', 403, { remaining_m: 7.24 }))]);
    emit(geo);
    fireEvent.click(await screen.findByTestId('frame-near'));
    await waitFor(() => expect(document.body.textContent).toContain('8m 더 가까이 가야 열 수 있어요'));
    expect(screen.queryByRole('button', { name: '열람 닫기' })).toBeNull();
  });

  it('FE-11 FR-03 422 LOW_ACCURACY → 재측정 안내', async () => {
    const { geo } = setup([near], [openRoute(apiError('LOW_ACCURACY', 422))]);
    emit(geo);
    fireEvent.click(await screen.findByTestId('frame-near'));
    expect(await screen.findByText('GPS 정확도가 낮아 열 수 없어요. 잠시 후 다시 시도해 주세요')).toBeTruthy();
  });

  it('FE-11 FR-10 404 → "더 이상 볼 수 없는 캡슐이에요" + 주변 재조회', async () => {
    const { geo, f } = setup([near], [openRoute(apiError('CAPSULE_NOT_FOUND', 404))]);
    emit(geo);
    fireEvent.click(await screen.findByTestId('frame-near'));
    expect(await screen.findByText('더 이상 볼 수 없는 캡슐이에요')).toBeTruthy();
    await waitFor(() => expect(f.callsTo('GET', NEARBY)).toHaveLength(2));
  });

  it('FE-11 500 → 메시지 안내', async () => {
    const { geo } = setup([near], [openRoute(apiError('INTERNAL_ERROR', 500))]);
    emit(geo);
    fireEvent.click(await screen.findByTestId('frame-near'));
    expect(await screen.findByText('잠시 후 다시 시도해 주세요')).toBeTruthy();
  });

  it('FE-11 위치가 없을 때 프레임 탭은 무시(프레임이 없으므로 /open 없음)', async () => {
    const { f } = setup([near]);
    await act(async () => {});
    expect(screen.queryByTestId('frame-near')).toBeNull();
    expect(f.calls).toHaveLength(0);
  });
});

describe('ArScreen 삭제 (FE-12)', () => {
  const mine = nearby({ id: 'near', title: '내 캡슐', is_mine: true, ...HERE });

  it('FE-12 FR-11 내 캡슐: confirm 확인 → DELETE, 주변 재조회, OpenView 닫힘', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true));
    const { geo, f } = setup([mine], [
      openRoute({ json: { media_url: '/api/media/m1' } }),
      { method: 'DELETE', url: '/api/capsules/near', reply: { status: 204 } },
    ]);
    emit(geo);
    fireEvent.click(await screen.findByTestId('frame-near'));
    await screen.findByAltText('내 캡슐');
    click('삭제');
    await waitFor(() => expect(screen.queryByAltText('내 캡슐')).toBeNull());
    expect(f.callsTo('DELETE', '/api/capsules/near')).toHaveLength(1);
    await waitFor(() => expect(f.callsTo('GET', NEARBY)).toHaveLength(2));
  });

  it('FE-12 FR-11 남의 캡슐에는 삭제 버튼이 없다', async () => {
    const { geo } = setup([nearby({ id: 'near', title: '남의 캡슐', ...HERE })], [
      openRoute({ json: { media_url: '/api/media/m1' } }),
    ]);
    emit(geo);
    fireEvent.click(await screen.findByTestId('frame-near'));
    await screen.findByAltText('남의 캡슐');
    expect(screen.queryByRole('button', { name: '삭제' })).toBeNull();
  });
});
