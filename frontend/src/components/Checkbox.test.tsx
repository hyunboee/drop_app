import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Checkbox } from './Checkbox';

describe('Checkbox', () => {
  it('FE-02 체크 안 된 상태에서 클릭하면 onChange(true)', () => {
    const onChange = vi.fn();
    render(<Checkbox label="위치정보 이용 동의" checked={false} onChange={onChange} />);
    const box = screen.getByLabelText('위치정보 이용 동의') as HTMLInputElement;
    expect(box.type).toBe('checkbox');
    expect(box.checked).toBe(false);
    fireEvent.click(box);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('FE-02 체크된 상태에서 클릭하면 onChange(false)', () => {
    const onChange = vi.fn();
    render(<Checkbox label="만 14세 이상입니다" checked onChange={onChange} />);
    const box = screen.getByLabelText('만 14세 이상입니다') as HTMLInputElement;
    expect(box.checked).toBe(true);
    fireEvent.click(box);
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('FE-02 onViewTerms가 있으면 "전문 보기" 버튼이 있고 클릭 시 호출', () => {
    const onViewTerms = vi.fn();
    render(<Checkbox label="약관" checked={false} onChange={() => {}} onViewTerms={onViewTerms} />);
    fireEvent.click(screen.getByRole('button', { name: '전문 보기' }));
    expect(onViewTerms).toHaveBeenCalledTimes(1);
  });

  it('FE-02 onViewTerms가 없으면 "전문 보기" 버튼이 없다', () => {
    render(<Checkbox label="약관" checked={false} onChange={() => {}} />);
    expect(screen.queryByRole('button', { name: '전문 보기' })).toBeNull();
  });
});
