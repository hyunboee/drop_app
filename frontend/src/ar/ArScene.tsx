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
  // W-13 드롭 위치 정하기 중인 미리보기 프레임 좌표 (null이면 안 그린다)
  placeAt?: { lat: number; lng: number } | null;
  onPlaceMove?(target: { lat: number; lng: number }): void;
}

const FRAME_SIZE = 3;
const PLACE_START_M = 3;
// AR.js gps-new-camera 월드 좌표는 스페리컬 메르카토르(x = 동, z = -북). 실제 m = 월드 단위 × cos(위도)
const HALF_EARTH = 20037508.34;
const toLatLng = (x: number, z: number) => ({
  lng: (x / HALF_EARTH) * 180,
  lat: (360 / Math.PI) * Math.atan(Math.exp((-z / HALF_EARTH) * Math.PI)) - 90,
});

// A-Frame·three.js는 타입 선언이 없어 any로 다룬다
const three = () => (window as any).AFRAME.THREE;

const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
// 알파가 있는 토큰(--color-frame-out)은 색과 opacity로 분리한다
const alphaOf = (color: string) => Number(color.split(',')[3]?.replace(')', '')) || 1;

export default function ArScene({ frames, onTap, placeAt = null, onPlaceMove }: ArSceneProps) {
  const sceneRef = useRef<HTMLElement>(null);
  const previewRef = useRef<HTMLElement>(null);
  const onTapRef = useRef(onTap);
  onTapRef.current = onTap;
  const onPlaceMoveRef = useRef(onPlaceMove);
  onPlaceMoveRef.current = onPlaceMove;
  const placing = placeAt != null;
  const placingRef = useRef(placing);
  placingRef.current = placing;

  // 위치 정하기를 시작하면 보고 있는 방향 PLACE_START_M 앞 바닥에 프레임을 둔다
  useEffect(() => {
    const cam = (sceneRef.current as any)?.camera;
    if (!placing || !cam) return;
    const T = three();
    const p = cam.getWorldPosition(new T.Vector3());
    if (Math.abs(p.x) < 1000) return; // 아직 GPS 위치를 못 받음
    const d = cam.getWorldDirection(new T.Vector3()).setY(0);
    if (d.lengthSq() < 1e-6) d.set(0, 0, -1);
    d.normalize().multiplyScalar(PLACE_START_M / Math.cos((toLatLng(p.x, p.z).lat * Math.PI) / 180));
    onPlaceMoveRef.current?.(toLatLng(p.x + d.x, p.z + d.z));
  }, [placing]);

  // 미리보기 프레임 위에서 시작한 드래그만 프레임을 옮기고, 그동안 화면 둘러보기를 멈춘다
  useEffect(() => {
    const scene = sceneRef.current as any;
    if (!scene) return;
    const T = three();
    const raycaster = new T.Raycaster();
    let dragging = false;
    const look = (on: boolean) => scene.querySelector('a-camera')?.setAttribute('look-controls', { enabled: on, touchEnabled: on });
    const aim = (e: PointerEvent) => {
      const rect = (scene.canvas as HTMLCanvasElement).getBoundingClientRect();
      const ndc = { x: ((e.clientX - rect.left) / rect.width) * 2 - 1, y: -((e.clientY - rect.top) / rect.height) * 2 + 1 };
      raycaster.setFromCamera(ndc, scene.camera);
      return raycaster.ray;
    };
    const down = (e: PointerEvent) => {
      const preview = (previewRef.current as any)?.object3D;
      if (!placingRef.current || !preview || !scene.camera || !scene.canvas) return;
      aim(e);
      if (raycaster.intersectObject(preview, true).length === 0) return;
      dragging = true;
      look(false);
    };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      const { origin, direction } = aim(e);
      if (direction.y > -1e-3) return; // 지평선 위는 바닥과 만나지 않는다
      const t = -origin.y / direction.y;
      onPlaceMoveRef.current?.(toLatLng(origin.x + direction.x * t, origin.z + direction.z * t));
    };
    const up = () => {
      if (!dragging) return;
      dragging = false;
      look(true);
    };
    scene.addEventListener('pointerdown', down, true);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      scene.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, []);

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
      // arjs-webcam-texture가 body에 붙인 카메라 영상을 정리한다
      document.querySelectorAll<HTMLVideoElement>('body > video').forEach((v) => {
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
      {placeAt && (
        <a-entity ref={previewRef} gps-new-entity-place={`latitude: ${placeAt.lat}; longitude: ${placeAt.lng}`}>
          <a-plane
            width={FRAME_SIZE}
            height={FRAME_SIZE}
            material={`color: ${frameIn}; opacity: 0.55; transparent: true; shader: flat; side: double`}
          />
          <a-text value="NEW" align="center" color={textColor} width="6" position={`0 ${-FRAME_SIZE / 2 - 0.4} 0`} />
        </a-entity>
      )}
    </a-scene>
  );
}
