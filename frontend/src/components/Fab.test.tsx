import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Fab } from './Fab';

describe('Fab', () => {
  it('FE-06 open=false이면 aria-label "메뉴 열기", 클릭 시 onClick', () => {
    const onClick = vi.fn();
    render(<Fab open={false} onClick={onClick} />);
    fireEvent.click(screen.getByRole('button', { name: '메뉴 열기' }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: '메뉴 닫기' })).toBeNull();
  });

  it('FE-06 open=true이면 aria-label "메뉴 닫기"', () => {
    render(<Fab open onClick={() => {}} />);
    expect(screen.getByRole('button', { name: '메뉴 닫기' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '메뉴 열기' })).toBeNull();
  });
});
