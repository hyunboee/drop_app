import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AccuracyBanner } from './AccuracyBanner';

describe('AccuracyBanner', () => {
  it('FE-06 PRM-03 visible이면 role="status"로 안내 문구를 보여 준다', () => {
    render(<AccuracyBanner visible />);
    expect(screen.getByRole('status').textContent).toContain('GPS 정확도가 낮아요. 드롭·열람이 막혀요');
  });

  it('FE-06 PRM-03 visible이 false이면 렌더링하지 않는다', () => {
    const { container } = render(<AccuracyBanner visible={false} />);
    expect(screen.queryByRole('status')).toBeNull();
    expect(container.textContent).toBe('');
  });
});
