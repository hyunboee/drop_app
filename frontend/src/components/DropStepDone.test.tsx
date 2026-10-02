import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DropStepDone } from './DropStepDone';

describe('DropStepDone (W-10)', () => {
  it('FE-10 FR-07 완료 문구·제목·만료일을 표시하고 "확인"이 onConfirm 호출', () => {
    const onConfirm = vi.fn();
    render(<DropStepDone title="우리 동네" expiresAt={new Date(2026, 10, 30, 12).toISOString()} onConfirm={onConfirm} />);
    expect(screen.getByText('캡슐을 남겼어요')).toBeTruthy();
    expect(screen.getByText('우리 동네')).toBeTruthy();
    expect(screen.getByText('11월 30일까지 보여요')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '확인' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
