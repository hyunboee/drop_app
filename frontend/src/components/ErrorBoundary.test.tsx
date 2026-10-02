import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';
import { log } from '../lib/log';

function Bomb(): never {
  throw new Error('boom');
}

describe('ErrorBoundary', () => {
  it('FE-01 자식이 정상이면 그대로 렌더링', () => {
    render(
      <ErrorBoundary>
        <p>안녕</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText('안녕')).toBeTruthy();
    expect(screen.queryByText('문제가 생겼어요. 다시 불러와 주세요')).toBeNull();
  });

  it('FE-01 자식이 던지면 메시지 표시, log.error(render) 호출', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const spy = vi.spyOn(log, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );
    expect(screen.getByText('문제가 생겼어요. 다시 불러와 주세요')).toBeTruthy();
    expect(spy).toHaveBeenCalled();
    const [scope, err] = spy.mock.calls[0];
    expect(scope).toBe('render');
    expect((err as Error).message).toBe('boom');
  });

  it('FE-01 "새로고침" 버튼이 location.reload 호출', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(log, 'error').mockImplementation(() => {});
    const reload = vi.fn();
    vi.stubGlobal('location', { reload });
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );
    fireEvent.click(screen.getByRole('button', { name: '새로고침' }));
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
