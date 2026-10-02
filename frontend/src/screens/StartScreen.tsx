import { useState } from 'react';
import { Button } from '../components/Button';
import { PhotoScreen } from '../components/PhotoScreen';
import { GEO_TIMEOUT_MS } from '../params';
import { log } from '../lib/log';
import { useArStore, type PermissionName } from '../stores/ar';
import { useSession } from '../stores/session';
import styles from './PermissionScreen.module.css';

type OrientationEventWithPermission = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<string> };

async function requestOrientation(): Promise<boolean> {
  const ctor = typeof DeviceOrientationEvent === 'undefined' ? undefined : (DeviceOrientationEvent as OrientationEventWithPermission);
  if (typeof ctor?.requestPermission !== 'function') return true; // Android: 권한 팝업 없음
  try {
    return (await ctor.requestPermission()) === 'granted';
  } catch (error) {
    log.error('permission', error);
    return false;
  }
}

async function requestCamera(): Promise<boolean> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    stream.getTracks().forEach((t) => t.stop());
    return true;
  } catch (error) {
    log.error('permission', error);
    return false;
  }
}

function requestLocation(): Promise<boolean> {
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => {
        useArStore.getState().setPosition({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy });
        resolve(true);
      },
      (error) => {
        log.error('permission', error);
        resolve(false);
      },
      { enableHighAccuracy: true, timeout: GEO_TIMEOUT_MS },
    );
  });
}

export function StartScreen() {
  const [loading, setLoading] = useState(false);

  // 사용자 제스처 안에서 방향 -> 카메라 -> 위치 순서로 요청하고, 거부돼도 끝까지 요청한다
  async function start() {
    setLoading(true);
    const denied: PermissionName[] = [];
    if (!(await requestOrientation())) denied.push('orientation');
    if (!(await requestCamera())) denied.push('camera');
    if (!(await requestLocation())) denied.push('location');
    denied.forEach((name) => log.warn('permission', 'denied', name));
    useArStore.getState().setDenied(denied);
    useSession.getState().setScreen(denied.length === 0 ? 'ar' : 'denied');
  }

  return (
    <PhotoScreen blurred wordmark>
      <div className={styles.body}>
        <h1 className={styles.title}>Drop을 시작하려면 아래 권한이 필요해요</h1>
        <ul className={styles.list}>
          <li>카메라</li>
          <li>위치</li>
          <li>방향 센서</li>
        </ul>
      </div>
      <Button loading={loading} onClick={() => void start()}>시작</Button>
    </PhotoScreen>
  );
}
