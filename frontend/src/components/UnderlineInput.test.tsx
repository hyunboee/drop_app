import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { UnderlineInput } from './UnderlineInput';

describe('UnderlineInput', () => {
  it('FE-02 label과 input이 연결되어 getByLabelText로 찾히고 입력값이 onChange로 전달', () => {
    const onChange = vi.fn();
    render(<UnderlineInput label="이메일" value="" onChange={onChange} />);
    const input = screen.getByLabelText('이메일') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'a@b.c' } });
    expect(onChange).toHaveBeenCalledWith('a@b.c');
  });

  it('FE-02 value·type·placeholder·autoComplete가 input에 반영', () => {
    render(
      <UnderlineInput
        label="비밀번호"
        type="password"
        value="secret"
        onChange={() => {}}
        placeholder="입력"
        autoComplete="current-password"
      />,
    );
    const input = screen.getByLabelText('비밀번호') as HTMLInputElement;
    expect(input.type).toBe('password');
    expect(input.value).toBe('secret');
    expect(input.placeholder).toBe('입력');
    expect(input.autocomplete).toBe('current-password');
  });

  it('FE-02 type을 생략하면 text', () => {
    render(<UnderlineInput label="제목" value="" onChange={() => {}} />);
    expect((screen.getByLabelText('제목') as HTMLInputElement).type).toBe('text');
  });

  it('FE-02 counter가 있으면 "{current}/{max}"를 라벨 밖에 표시하고, 없으면 표시하지 않는다', () => {
    const { rerender } = render(
      <UnderlineInput label="제목" value="abc" onChange={() => {}} counter={{ current: 3, max: 40 }} />,
    );
    expect(screen.getByText('3/40')).toBeTruthy();
    // 라벨 이름에 카운터가 섞이지 않는다
    expect(screen.getByLabelText('제목')).toBeTruthy();
    rerender(<UnderlineInput label="제목" value="abc" onChange={() => {}} />);
    expect(screen.queryByText('3/40')).toBeNull();
  });

  it('FE-02 error가 있으면 role="alert"에 문구, 없으면 alert 없음', () => {
    const { rerender } = render(<UnderlineInput label="이메일" value="" onChange={() => {}} error="입력값을 확인해 주세요" />);
    expect(screen.getByRole('alert').textContent).toBe('입력값을 확인해 주세요');
    rerender(<UnderlineInput label="이메일" value="" onChange={() => {}} />);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
