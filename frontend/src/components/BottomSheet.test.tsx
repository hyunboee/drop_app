import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { BottomSheet } from './BottomSheet';

describe('BottomSheet', () => {
  it.each([1, 2, 3, 4] as const)('FE-09 단계 텍스트 "%i/4"와 children을 표시', (step) => {
    render(
      <BottomSheet step={step}>
        <p>내용</p>
      </BottomSheet>,
    );
    expect(screen.getByText(`${step}/4`)).toBeTruthy();
    expect(screen.getByText('내용')).toBeTruthy();
  });

  it('FE-09 onClose가 있으면 "시트 닫기" 버튼이 onClose를 호출', () => {
    const onClose = vi.fn();
    render(
      <BottomSheet step={1} onClose={onClose}>
        x
      </BottomSheet>,
    );
    fireEvent.click(screen.getByRole('button', { name: '시트 닫기' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('FE-10 onClose가 없으면(W-09) 닫기 버튼이 없다', () => {
    render(
      <BottomSheet step={3}>
        x
      </BottomSheet>,
    );
    expect(screen.queryByRole('button', { name: '시트 닫기' })).toBeNull();
  });
});
