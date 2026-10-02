// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import * as p from './params';

const backend = readFileSync(new URL('../../backend/src/params.js', import.meta.url), 'utf8');

const SHARED = [
  'PRM_01_OPEN_RADIUS_M',
  'PRM_03_ACCURACY_CAP_M',
  'PRM_03_REMEASURE_ACCURACY_M',
  'M_06_PHOTO_MAX_BYTES',
  'M_10_PASSWORD_MIN_LENGTH',
  'M_11_TITLE_MIN_LENGTH',
  'M_11_TITLE_MAX_LENGTH',
  'PRM_20_DROP_PLACE_RADIUS_M',
] as const;

describe('params', () => {
  it('FE-01 P-05 공유 상수 8개가 backend/src/params.js와 이름·값 일치', () => {
    for (const name of SHARED) {
      const m = new RegExp(`export const ${name} = (\\d+);`).exec(backend);
      expect(m, `backend에 ${name} 없음`).not.toBeNull();
      expect(p[name]).toBe(Number(m![1]));
    }
  });

  it('FE-01 프론트 전용 값 M-02=10000, M-07=320, M-13=2048', () => {
    expect(p.M_02_NEARBY_MIN_INTERVAL_MS).toBe(10000);
    expect(p.M_07_THUMB_LONG_SIDE_PX).toBe(320);
    expect(p.M_13_ORIGINAL_LONG_SIDE_PX).toBe(2048);
  });

  it('FE-01 프론트 결정값 JPEG_QUALITY=0.85, GEO_TIMEOUT_MS=15000', () => {
    expect(p.JPEG_QUALITY).toBe(0.85);
    expect(p.GEO_TIMEOUT_MS).toBe(15000);
  });
});
