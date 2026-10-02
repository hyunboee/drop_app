import { vi, type Mock } from 'vitest';

const restorers: (() => void)[] = [];

// 전역 속성을 바꾸고 원복 함수를 등록한다
function override(target: object, key: string, value: unknown) {
  const original = Object.getOwnPropertyDescriptor(target, key);
  Object.defineProperty(target, key, { configurable: true, writable: true, value });
  restorers.push(() => {
    if (original) Object.defineProperty(target, key, original);
    else delete (target as Record<string, unknown>)[key];
  });
}

export function restoreBrowserMocks() {
  while (restorers.length) restorers.pop()!();
}

export function mockGeolocation() {
  let success: ((p: unknown) => void) | undefined;
  let failure: ((e: unknown) => void) | undefined;
  const toPosition = (p: { lat: number; lng: number; accuracy: number }) => ({
    coords: { latitude: p.lat, longitude: p.lng, accuracy: p.accuracy },
    timestamp: Date.now(),
  });
  const getCurrentPosition: Mock = vi.fn((ok, err) => {
    success = ok;
    failure = err;
  });
  const watchPosition: Mock = vi.fn((ok, err) => {
    success = ok;
    failure = err;
    return 1;
  });
  const clearWatch: Mock = vi.fn();
  override(navigator, 'geolocation', { getCurrentPosition, watchPosition, clearWatch });
  return {
    getCurrentPosition,
    watchPosition,
    clearWatch,
    emit: (p: { lat: number; lng: number; accuracy: number }) => success?.(toPosition(p)),
    fail: (code = 1) => failure?.({ code, message: 'geolocation error' }),
  };
}

export function mockCamera(result: 'granted' | 'denied' | 'absent') {
  const stopSpy: Mock = vi.fn();
  if (result === 'absent') {
    override(navigator, 'mediaDevices', undefined);
  } else {
    const getUserMedia = vi.fn(async () => {
      if (result === 'denied') throw new DOMException('denied', 'NotAllowedError');
      return { getTracks: () => [{ stop: stopSpy }] };
    });
    override(navigator, 'mediaDevices', { getUserMedia });
  }
  return { stopSpy };
}

export function mockOrientationPermission(result: 'granted' | 'denied' | 'absent') {
  const requestPermission: Mock | undefined =
    result === 'absent' ? undefined : vi.fn(async () => (result === 'granted' ? 'granted' : 'denied'));
  class FakeDeviceOrientationEvent extends Event {
    static requestPermission = requestPermission;
  }
  override(globalThis, 'DeviceOrientationEvent', FakeDeviceOrientationEvent);
  return { requestPermission };
}

export function fireOrientation(
  type: 'deviceorientation' | 'deviceorientationabsolute',
  init: { alpha?: number; absolute?: boolean; webkitCompassHeading?: number },
) {
  window.dispatchEvent(Object.assign(new Event(type), init));
}
