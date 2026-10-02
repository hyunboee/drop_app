import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Notice, type NoticeState } from './Notice';

function show(notice: NoticeState, onClose = vi.fn()) {
  const view = render(<Notice notice={notice} onClose={onClose} />);
  return { ...view, onClose };
}

describe('Notice (W-12)', () => {
  it('FE-08 FE-11 out_of_range는 올림한 거리 + "더 가까이 가야 열 수 있어요" (28.5 → 29m)', () => {
    const { container } = show({ kind: 'out_of_range', remainingM: 28.5 });
    expect(container.textContent).toContain('29m 더 가까이 가야 열 수 있어요');
    expect(screen.getByText('29m')).toBeTruthy();
  });

  it('FE-11 out_of_range 7.24 → "8m"', () => {
    const { container } = show({ kind: 'out_of_range', remainingM: 7.24 });
    expect(container.textContent).toContain('8m 더 가까이 가야 열 수 있어요');
  });

  it('FE-08 open_remeasure 문구', () => {
    show({ kind: 'open_remeasure' });
    expect(screen.getByText('GPS 정확도가 낮아 열 수 없어요. 잠시 후 다시 시도해 주세요')).toBeTruthy();
  });

  it('FE-08 drop_remeasure 문구', () => {
    show({ kind: 'drop_remeasure' });
    expect(screen.getByText('GPS 정확도가 낮아 드롭할 수 없어요. 잠시 후 다시 시도해 주세요')).toBeTruthy();
  });

  it('FE-11 not_found 문구', () => {
    show({ kind: 'not_found' });
    expect(screen.getByText('더 이상 볼 수 없는 캡슐이에요')).toBeTruthy();
  });

  it('FE-12 message는 text를 그대로 표시', () => {
    show({ kind: 'message', text: '내 캡슐만 삭제할 수 있어요' });
    expect(screen.getByText('내 캡슐만 삭제할 수 있어요')).toBeTruthy();
  });

  it('FE-08 "닫기" 클릭 시 onClose', () => {
    const { onClose } = show({ kind: 'not_found' });
    fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
