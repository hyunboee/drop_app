import { useEffect, useRef } from 'react';
import 'aframe';
import '@ar-js-org/ar.js/aframe/build/aframe-ar-new-location-only.mjs';

export interface ArFrame {
  id: string;
  title: string;
  lat: number;
  lng: number;
  thumbUrl: string;
  openable: boolean;
  remainingLabel: string | null;
}
export interface ArSceneProps {
  frames: ArFrame[];
  onTap(capsuleId: string): void;
}

const FRAME_SIZE = 3;

const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
// 알파가 있는 토큰(--color-frame-out)은 색과 opacity로 분리한다
const alphaOf = (color: string) => Number(color.split(',')[3]?.replace(')', '')) || 1;

export default function ArScene({ frames, onTap }: ArSceneProps) {
  const sceneRef = useRef<HTMLElement>(null);
  const onTapRef = useRef(onTap);
  onTapRef.current = onTap;

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const onClick = (e: Event) => {
      const id = (e.target as HTMLElement).closest?.('[data-capsule-id]')?.getAttribute('data-capsule-id');
      if (id) onTapRef.current(id);
    };
    scene.addEventListener('click', onClick);
    return () => {
      scene.removeEventListener('click', onClick);
      // AR.js가 body에 붙인 카메라 영상을 정리한다
      document.querySelectorAll<HTMLVideoElement>('video.arjs-video, #arjs-video').forEach((v) => {
        (v.srcObject as MediaStream | null)?.getTracks().forEach((t) => t.stop());
        v.remove();
      });
    };
  }, []);

  const frameIn = token('--color-frame-in');
  const frameOutOpacity = alphaOf(token('--color-frame-out'));
  const textColor = token('--color-text');
  const distanceColor = token('--color-gold-300');

  return (
    <a-scene
      ref={sceneRef}
      embedded
      vr-mode-ui="enabled: false"
      // location-only 빌드에는 `arjs` 시스템이 없어 카메라 영상은 이 컴포넌트가 깐다
      arjs-webcam-texture=""
      renderer="antialias: true; alpha: true"
      cursor="rayOrigin: mouse"
      raycaster="objects: .capsule-frame"
    >
      <a-camera gps-new-camera="gpsMinDistance: 5" />
      {frames.map((f) => (
        <a-entity key={f.id} gps-new-entity-place={`latitude: ${f.lat}; longitude: ${f.lng}`} data-capsule-id={f.id} class="capsule-frame">
          <a-plane
            width={FRAME_SIZE + 0.2}
            height={FRAME_SIZE + 0.2}
            position="0 0 -0.01"
            material={`color: ${frameIn}; opacity: ${f.openable ? 1 : frameOutOpacity}; transparent: true; shader: flat`}
          />
          <a-image src={f.thumbUrl} width={FRAME_SIZE} height={FRAME_SIZE} opacity={f.openable ? 1 : 0.5} />
          <a-text value={f.title} align="center" color={textColor} width="6" position={`0 ${-FRAME_SIZE / 2 - 0.4} 0`} />
          {f.remainingLabel && (
            <a-text value={f.remainingLabel} align="center" color={distanceColor} width="6" position={`0 ${-FRAME_SIZE / 2 - 0.9} 0`} />
          )}
        </a-entity>
      ))}
    </a-scene>
  );
}
