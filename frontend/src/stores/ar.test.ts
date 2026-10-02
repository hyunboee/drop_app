import { beforeEach, describe, it, expect } from 'vitest';
import { useArStore } from './ar';
import { resetStores } from '../test/render';

beforeEach(() => resetStores());

describe('ar store', () => {
  it('FE-01 초기값은 denied=[], position=null, heading=null', () => {
    const s = useArStore.getState();
    expect(s.denied).toEqual([]);
    expect(s.position).toBeNull();
    expect(s.heading).toBeNull();
  });

  it('FE-01 setDenied/setPosition/setHeading', () => {
    const s = useArStore.getState();
    s.setDenied(['camera', 'location']);
    s.setPosition({ lat: 37.5, lng: 127, accuracy: 5 });
    s.setHeading(123.4);
    const n = useArStore.getState();
    expect(n.denied).toEqual(['camera', 'location']);
    expect(n.position).toEqual({ lat: 37.5, lng: 127, accuracy: 5 });
    expect(n.heading).toBe(123.4);
    n.setHeading(null);
    expect(useArStore.getState().heading).toBeNull();
  });

  it('FE-01 getInitialState로 초기화된다', () => {
    useArStore.getState().setHeading(10);
    useArStore.setState(useArStore.getInitialState(), true);
    expect(useArStore.getState().heading).toBeNull();
  });
});
