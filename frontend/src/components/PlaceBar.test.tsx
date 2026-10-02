import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { PlaceBar } from './PlaceBar';

function setup(distanceM: number, heading = 135) {
  const props = { distanceM, heading, onHeading: vi.fn(), onCancel: vi.fn(), onConfirm: vi.fn() };
  render(<PlaceBar {...props} />);
  return props;
}

const confirmButton = () => screen.getByRole('button', { name: '여기에 놓기' }) as HTMLButtonElement;

describe('PlaceBar (W-13)', () => {
  it('FE-13 FR-03 안내와 반올림한 거리를 보여 주고, "여기에 놓기"·"취소"가 콜백을 부른다', () => {
    const p = setup(3.4);
    expect(screen.getByText('프레임을 끌어 놓을 곳을 정하세요')).toBeTruthy();
    expect(screen.getByText('내 위치에서 3m')).toBeTruthy();
    fireEvent.click(confirmButton());
    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    expect(p.onConfirm).toHaveBeenCalledTimes(1);
    expect(p.onCancel).toHaveBeenCalledTimes(1);
  });

  it('FE-14 방향 슬라이더: 0~359, 1° 단위, 현재 값 표시, 움직이면 onHeading(숫자)', () => {
    const p = setup(3, 135);
    const slider = screen.getByLabelText(/방향/) as HTMLInputElement;
    expect([slider.type, slider.min, slider.max, slider.step, slider.value]).toEqual(['range', '0', '359', '1', '135']);
    expect(screen.getByText('135°')).toBeTruthy();
    fireEvent.change(slider, { target: { value: '270' } });
    expect(p.onHeading).toHaveBeenCalledWith(270);
  });

  it('FE-13 PRM-20 경계: 10m는 놓을 수 있고, 넘으면 "여기에 놓기" 비활성 + 안내', () => {
    setup(10);
    expect(confirmButton().disabled).toBe(false);
    expect(screen.queryByText('내 위치에서 10m 안에만 놓을 수 있어요')).toBeNull();
  });

  it('FE-13 PRM-20 초과(10.01m)면 비활성, 눌러도 onConfirm 미호출', () => {
    const p = setup(10.01);
    expect(confirmButton().disabled).toBe(true);
    expect(screen.getByText('내 위치에서 10m 안에만 놓을 수 있어요')).toBeTruthy();
    fireEvent.click(confirmButton());
    expect(p.onConfirm).not.toHaveBeenCalled();
  });
});
