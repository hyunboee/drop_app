import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Button } from './Button';

describe('Button', () => {
  it('FE-02 기본(primary) 클릭 시 onClick 호출', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>저장</Button>);
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('FE-02 variant secondary·text·danger가 모두 렌더링되고 클릭된다', () => {
    const onClick = vi.fn();
    render(
      <>
        <Button variant="secondary" onClick={onClick}>보조</Button>
        <Button variant="text" onClick={onClick}>텍스트</Button>
        <Button variant="text" danger onClick={onClick}>삭제</Button>
      </>,
    );
    for (const name of ['보조', '텍스트', '삭제']) fireEvent.click(screen.getByRole('button', { name }));
    expect(onClick).toHaveBeenCalledTimes(3);
  });

  it('FE-02 loading이면 disabled + aria-busy, children은 그대로 남고 클릭이 무시된다', () => {
    const onClick = vi.fn();
    render(<Button loading onClick={onClick}>로그인</Button>);
    const button = screen.getByRole('button', { name: '로그인' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.textContent).toContain('로그인');
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('FE-02 loading이 아니면 aria-busy가 true가 아니다', () => {
    render(<Button>확인</Button>);
    const button = screen.getByRole('button', { name: '확인' }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    expect(button.getAttribute('aria-busy')).not.toBe('true');
  });

  it('FE-02 disabled이면 클릭이 무시된다', () => {
    const onClick = vi.fn();
    render(<Button disabled onClick={onClick}>다음</Button>);
    const button = screen.getByRole('button', { name: '다음' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('FE-02 type="submit"을 전달하면 폼을 제출한다', () => {
    const onSubmit = vi.fn((e: { preventDefault(): void }) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <Button type="submit">보내기</Button>
      </form>,
    );
    fireEvent.click(screen.getByRole('button', { name: '보내기' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
