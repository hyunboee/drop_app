import { describe, it, expect } from 'vitest';
import { clampOffset, distanceM, isLowAccuracy, judgeOpen, formatRemaining, latLngToOffset, offsetToLatLng, toHeading, frameState } from './geo';
import { northOf } from '../test/samples';

const base = { lat: 37.5665, lng: 126.978 };

describe('distanceM (BE-07 공통 표)', () => {
  it('FE-04 G-01 같은 점은 0', () => {
    expect(distanceM(base, { lat: 37.5665, lng: 126.978 })).toBe(0);
  });

  it('FE-04 G-02 위도 +0.0001 → 11.12m', () => {
    expect(distanceM(base, { lat: 37.5666, lng: 126.978 })).toBeCloseTo(11.12, 2);
  });

  it('FE-04 G-03 위도 +0.0002 → 22.24m', () => {
    expect(distanceM(base, { lat: 37.5667, lng: 126.978 })).toBeCloseTo(22.24, 2);
  });

  it('FE-04 G-04 위도 +0.0004 → 44.48m', () => {
    expect(distanceM(base, { lat: 37.5669, lng: 126.978 })).toBeCloseTo(44.48, 2);
  });

  it('FE-04 거리는 방향과 무관(대칭)', () => {
    const b = { lat: 37.5669, lng: 126.9785 };
    expect(distanceM(base, b)).toBeCloseTo(distanceM(b, base), 9);
  });
});

describe('judgeOpen (BE-07 공통 표)', () => {
  it('FE-04 J-01 d=0, acc=5 → 허용, remaining 0', () => {
    expect(judgeOpen(0, 5)).toEqual({ allowed: true, remainingM: 0 });
  });

  it('FE-04 J-02 d=10, acc=0 → 허용(경계 같음), remaining 0', () => {
    expect(judgeOpen(10, 0)).toEqual({ allowed: true, remainingM: 0 });
  });

  it('FE-04 J-03 d=10.5, acc=0 → 거부, remaining 0.5(반올림 없음)', () => {
    const r = judgeOpen(10.5, 0);
    expect(r.allowed).toBe(false);
    expect(r.remainingM).toBeCloseTo(0.5, 9);
  });

  it('FE-04 J-04 d=30, acc=20 → 허용(경계), remaining 0', () => {
    expect(judgeOpen(30, 20)).toEqual({ allowed: true, remainingM: 0 });
  });

  it('FE-04 J-05 d=30, acc=25 → 허용(보정 상한 20 적용), remaining 0', () => {
    expect(judgeOpen(30, 25)).toEqual({ allowed: true, remainingM: 0 });
  });

  it('FE-04 J-06 d=40, acc=25 → 거부, remaining 10', () => {
    const r = judgeOpen(40, 25);
    expect(r.allowed).toBe(false);
    expect(r.remainingM).toBeCloseTo(10, 9);
  });

  it('FE-04 J-07 d=22.24, acc=5 → 거부, remaining 7.24', () => {
    const r = judgeOpen(22.24, 5);
    expect(r.allowed).toBe(false);
    expect(r.remainingM).toBeCloseTo(7.24, 2);
  });

  it('PRD7 judgeOpen: allowed ⇔ remainingM === 0 (J-01·J-02·J-03·J-06 행)', () => {
    for (const [d, acc] of [
      [0, 5],
      [10, 0],
      [10.5, 0],
      [40, 25],
    ] as const) {
      const r = judgeOpen(d, acc);
      expect(r.allowed).toBe(r.remainingM === 0);
    }
  });
});

describe('isLowAccuracy (BE-07 공통 표)', () => {
  it('FE-04 A-01 accuracy=30 → false(판정함)', () => {
    expect(isLowAccuracy(30)).toBe(false);
  });

  it('FE-04 A-02 accuracy=30.01 → true(재측정 안내)', () => {
    expect(isLowAccuracy(30.01)).toBe(true);
  });
});

describe('formatRemaining (올림)', () => {
  it('FE-04 7.24 → "8m"', () => {
    expect(formatRemaining(7.24)).toBe('8m');
  });

  it('FE-04 0.5 → "1m"', () => {
    expect(formatRemaining(0.5)).toBe('1m');
  });

  it('FE-04 10 → "10m"(정수는 그대로)', () => {
    expect(formatRemaining(10)).toBe('10m');
  });

  it('FE-04 0 → "0m"', () => {
    expect(formatRemaining(0)).toBe('0m');
  });
});

describe('toHeading (FE-06)', () => {
  it('FE-06 iOS webkitCompassHeading 90 → 90', () => {
    expect(toHeading({ webkitCompassHeading: 90 })).toBe(90);
  });

  it('FE-06 iOS webkitCompassHeading 360 → 0', () => {
    expect(toHeading({ webkitCompassHeading: 360 })).toBe(0);
  });

  it('FE-06 iOS 음수는 [0, 360)으로 보정(-90 → 270)', () => {
    expect(toHeading({ webkitCompassHeading: -90 })).toBe(270);
  });

  it('FE-06 iOS 값이 있으면 alpha·absolute보다 우선', () => {
    expect(toHeading({ webkitCompassHeading: 10, alpha: 90, absolute: true })).toBe(10);
  });

  it('FE-06 Android absolute:true, alpha 90 → 270', () => {
    expect(toHeading({ absolute: true, alpha: 90 })).toBe(270);
  });

  it('FE-06 Android alpha 0 → 0', () => {
    expect(toHeading({ absolute: true, alpha: 0 })).toBe(0);
  });

  it('FE-06 Android alpha 359.5 → 0.5', () => {
    expect(toHeading({ absolute: true, alpha: 359.5 })).toBeCloseTo(0.5, 9);
  });

  it('FE-06 absolute가 false이거나 없으면 null', () => {
    expect(toHeading({ absolute: false, alpha: 90 })).toBeNull();
    expect(toHeading({ alpha: 90 })).toBeNull();
  });

  it('FE-06 값이 없거나 유한수가 아니면 null', () => {
    expect(toHeading({})).toBeNull();
    expect(toHeading({ absolute: true, alpha: null })).toBeNull();
    expect(toHeading({ webkitCompassHeading: null })).toBeNull();
    expect(toHeading({ webkitCompassHeading: NaN })).toBeNull();
    expect(toHeading({ absolute: true, alpha: Infinity })).toBeNull();
  });

  it('FE-06 결과는 항상 0 이상 360 미만', () => {
    for (const h of [-720, -1, 0, 1, 359.99, 360, 361, 720]) {
      const r = toHeading({ webkitCompassHeading: h })!;
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThan(360);
    }
  });
});

describe('frameState (FE-07)', () => {
  const here = { lat: 37.5665, lng: 126.978, accuracy: 5 };

  it('FE-07 반경 안이면 openable true, remainingLabel null', () => {
    expect(frameState(here, here)).toEqual({ openable: true, remainingM: 0, remainingLabel: null });
  });

  it('FE-07 PRD7 반경 안(J-04 d=30, acc=20)은 openable, remaining 0', () => {
    const s = frameState(northOf(here, 30), { ...here, accuracy: 20 });
    expect(s.openable).toBe(true);
    expect(s.remainingM).toBe(0);
  });

  it('FE-07 반경 밖 J-06 계열(d=40.5, acc=25) → remaining 10.5, "11m 남음"', () => {
    const s = frameState(northOf(here, 40.5), { ...here, accuracy: 25 });
    expect(s.openable).toBe(false);
    expect(s.remainingM).toBeCloseTo(10.5, 3);
    expect(s.remainingLabel).toBe('11m 남음');
  });

  it('FE-07 J-07 d=22.24, acc=5 → remaining 7.24, "8m 남음"', () => {
    const s = frameState(northOf(here, 22.24), here);
    expect(s.openable).toBe(false);
    expect(s.remainingM).toBeCloseTo(7.24, 2);
    expect(s.remainingLabel).toBe('8m 남음');
  });

  it('FE-07 정확도가 나빠도(>30) 같은 식으로 계산', () => {
    const s = frameState(northOf(here, 40.5), { ...here, accuracy: 50 });
    expect(s.remainingM).toBeCloseTo(judgeOpen(distanceM(here, northOf(here, 40.5)), 50).remainingM, 9);
    expect(s.openable).toBe(false);
  });
});

describe('드롭 배치 (FE-13)', () => {
  it('FE-13 FR-03 clampOffset: 반경 안은 그대로, 반경 밖은 같은 방향으로 PRM-20 경계까지', () => {
    expect(clampOffset(3, 4, 10)).toEqual({ eastM: 3, northM: 4 });
    expect(clampOffset(6, 8, 10)).toEqual({ eastM: 6, northM: 8 });
    const c = clampOffset(30, 40, 10);
    expect(c.eastM).toBeCloseTo(6, 9);
    expect(c.northM).toBeCloseTo(8, 9);
  });

  it('FE-13 FR-03 offsetToLatLng: 옮긴 좌표까지 distanceM이 이동 거리와 0.1m 안에서 같다', () => {
    for (const [e, n] of [[0, 3], [5, 0], [-6, 8], [7.07, -7.07]]) {
      const moved = offsetToLatLng(base, e, n);
      expect(Math.abs(distanceM(base, moved) - Math.hypot(e, n))).toBeLessThan(0.1);
    }
    const north = offsetToLatLng(base, 0, 10);
    expect(north.lng).toBe(base.lng);
    expect(north.lat).toBeGreaterThan(base.lat);
    expect(offsetToLatLng(base, 10, 0).lng).toBeGreaterThan(base.lng);
  });

  it('FE-13 latLngToOffset은 offsetToLatLng의 역', () => {
    const o = latLngToOffset(base, offsetToLatLng(base, -6, 8));
    expect(o.eastM).toBeCloseTo(-6, 6);
    expect(o.northM).toBeCloseTo(8, 6);
  });
});
