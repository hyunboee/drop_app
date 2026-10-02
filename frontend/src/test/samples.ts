import type { GeoPosition } from '../stores/ar';

// api/capsules.ts(FE-06)의 NearbyCapsule과 같은 모양
export interface NearbyCapsuleSample {
  id: string;
  title: string;
  lat: number;
  lng: number;
  heading: number;
  thumb_url: string;
  is_mine: boolean;
}

export function nearby(over: Partial<NearbyCapsuleSample> = {}): NearbyCapsuleSample {
  return {
    id: 'c1',
    title: '캡슐',
    lat: 37.5665,
    lng: 126.978,
    heading: 0,
    thumb_url: '/api/media/m1/thumb',
    is_mine: false,
    ...over,
  };
}

export function pos(over: Partial<GeoPosition> = {}): GeoPosition {
  return { lat: 37.5665, lng: 126.978, accuracy: 5, ...over };
}

// 북쪽으로 meters만큼 떨어진 좌표 (백엔드 geo.test.js의 northOf와 같은 식)
export function northOf(p: { lat: number; lng: number }, meters: number) {
  return { lat: p.lat + ((meters / 6371000) * 180) / Math.PI, lng: p.lng };
}
