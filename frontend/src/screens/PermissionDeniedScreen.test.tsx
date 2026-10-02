import { beforeEach, describe, it, expect } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { PermissionDeniedScreen } from './PermissionDeniedScreen';
import { useArStore } from '../stores/ar';
import { useSession } from '../stores/session';
import { renderWithProviders, resetStores } from '../test/render';

beforeEach(() => {
  resetStores();
  useSession.getState().setScreen('denied');
});

describe('PermissionDeniedScreen', () => {
  it('FE-03 FR-02 제목·거부 안내·설정 안내 문구를 보여 준다', () => {
    useArStore.getState().setDenied(['camera']);
    renderWithProviders(<PermissionDeniedScreen />);
    expect(screen.getByText('AR 뷰를 사용할 수 없어요')).toBeTruthy();
    expect(screen.getByText('거부된 권한:')).toBeTruthy();
    expect(screen.getByText('세 권한 모두 있어야 프레임을 배치할 수 있어요')).toBeTruthy();
    expect(screen.getByText('권한 요청이 뜨지 않으면 브라우저 설정에서 허용한 뒤 재시도하세요')).toBeTruthy();
  });

  it('FE-03 FR-02 거부 권한을 한글 이름으로 각각 표시(camera→카메라)', () => {
    useArStore.getState().setDenied(['camera']);
    renderWithProviders(<PermissionDeniedScreen />);
    expect(screen.getByText('카메라')).toBeTruthy();
    expect(screen.queryByText('위치')).toBeNull();
    expect(screen.queryByText('방향 센서')).toBeNull();
  });

  it('FE-03 FR-02 location→위치, orientation→방향 센서', () => {
    useArStore.getState().setDenied(['location', 'orientation']);
    renderWithProviders(<PermissionDeniedScreen />);
    expect(screen.getByText('위치')).toBeTruthy();
    expect(screen.getByText('방향 센서')).toBeTruthy();
    expect(screen.queryByText('카메라')).toBeNull();
  });

  it('FE-03 FR-02 복수 거부는 모두 표시', () => {
    useArStore.getState().setDenied(['camera', 'location', 'orientation']);
    renderWithProviders(<PermissionDeniedScreen />);
    for (const name of ['카메라', '위치', '방향 센서']) expect(screen.getByText(name)).toBeTruthy();
  });

  it('FE-03 FR-02 재시도를 누르면 screen=start', () => {
    useArStore.getState().setDenied(['camera']);
    renderWithProviders(<PermissionDeniedScreen />);
    fireEvent.click(screen.getByRole('button', { name: '재시도' }));
    expect(useSession.getState().screen).toBe('start');
  });
});
