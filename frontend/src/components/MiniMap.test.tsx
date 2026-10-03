import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { offsetToLatLng } from '../lib/geo';
import { useArStore } from '../stores/ar';
import { MiniMap } from './MiniMap';

const here = { lat: 37.5665, lng: 126.978 };
const at = (id: string, eastM: number, northM: number, openable = false) => ({ id, openable, ...offsetToLatLng(here, eastM, northM) });
const dot = (id: string) => {
  const el = screen.getByRole('img').querySelector(`[data-capsule-id="${id}"]`)!;
  return { cx: Number(el.getAttribute('cx')), cy: Number(el.getAttribute('cy')) };
};

describe('MiniMap', () => {
  beforeEach(() => useArStore.setState({ heading: null }));

  it('캡슐마다 점을 그리고, 동쪽은 오른쪽·북쪽은 위에 둔다', () => {
    render(<MiniMap position={here} points={[at('east', 15, 0), at('north', 0, 15, true)]} />);
    expect(screen.getByRole('img').querySelectorAll('[data-capsule-id]')).toHaveLength(2);
    expect(dot('east').cx).toBeCloseTo(22, 0);
    expect(dot('east').cy).toBeCloseTo(0, 0);
    expect(dot('north').cx).toBeCloseTo(0, 0);
    expect(dot('north').cy).toBeCloseTo(-22, 0);
  });

  it('가장자리(30m)보다 먼 캡슐은 같은 방향 가장자리에 붙인다', () => {
    render(<MiniMap position={here} points={[at('far', 150, 0)]} />);
    expect(dot('far').cx).toBeCloseTo(44, 0);
  });

  it('보는 방향이 위로 오게 돌리고, 방향을 모르면 북쪽이 위다', () => {
    const { unmount } = render(<MiniMap position={here} points={[]} />);
    expect(screen.getByRole('img').querySelector('g')!.getAttribute('transform')).toBe('rotate(0)');
    unmount();
    useArStore.setState({ heading: 90.4 });
    render(<MiniMap position={here} points={[]} />);
    expect(screen.getByRole('img').querySelector('g')!.getAttribute('transform')).toBe('rotate(-90)');
  });
});
