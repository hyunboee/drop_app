import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { messageOf } from '../api/client';
import { useNearbyCapsules, type NearbyCapsule } from '../api/capsules';
import { AccuracyBanner } from '../components/AccuracyBanner';
import { DropSheet } from '../components/DropSheet';
import { Fab } from '../components/Fab';
import { FabMenu, type Anchor } from '../components/FabMenu';
import { MiniMap } from '../components/MiniMap';
import { Notice, type NoticeState } from '../components/Notice';
import { OpenView } from '../components/OpenView';
import { PlaceBar } from '../components/PlaceBar';
import { bearingDeg, clampOffset, distanceM, frameState, isLowAccuracy, latLngToOffset, offsetToLatLng, toHeading, type LatLng, type OrientationLike } from '../lib/geo';
import { log } from '../lib/log';
import { PRM_20_DROP_PLACE_RADIUS_M } from '../params';
import { useArStore, type GeoPosition } from '../stores/ar';
import styles from './ArScreen.module.css';

// A-Frame은 AR 화면에 들어갈 때만 불러온다(별도 청크)
const ArScene = lazy(() => import('../ar/ArScene'));

export function ArScreen() {
  const position = useArStore((s) => s.position);
  const [menuOpen, setMenuOpen] = useState(false);
  // 드롭 시트가 열려 있으면 true. 위치·방향을 정하면 anchor가 생긴다 (W-07 → W-13 → W-08)
  const [dropOpen, setDropOpen] = useState(false);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  // W-13 위치·방향 정하기 중인 프레임. touched: 슬라이더를 움직였는지 (전에는 늘 나를 바라보게 맞춘다)
  const [place, setPlace] = useState<{ at: LatLng; heading: number; touched: boolean; file: File } | null>(null);
  const [placeImage, setPlaceImage] = useState<string | null>(null);
  const [opened, setOpened] = useState<{ capsule: NearbyCapsule; position: GeoPosition } | null>(null);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const nearby = useNearbyCapsules(position);

  useEffect(() => {
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setGeoError(null);
        useArStore.getState().setPosition({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy });
      },
      (error) => {
        log.error('geo', error);
        setGeoError('위치를 가져올 수 없어요');
      },
      { enableHighAccuracy: true },
    );
    const onOrientation = (e: Event) => {
      const heading = toHeading(e as unknown as OrientationLike);
      if (heading !== null) useArStore.getState().setHeading(heading);
    };
    window.addEventListener('deviceorientationabsolute', onOrientation);
    window.addEventListener('deviceorientation', onOrientation);
    return () => {
      navigator.geolocation.clearWatch(id);
      window.removeEventListener('deviceorientationabsolute', onOrientation);
      window.removeEventListener('deviceorientation', onOrientation);
    };
  }, []);

  const placeFile = place?.file ?? null;
  useEffect(() => {
    if (!placeFile) return setPlaceImage(null);
    const url = URL.createObjectURL(placeFile);
    setPlaceImage(url);
    return () => URL.revokeObjectURL(url);
  }, [placeFile]);

  const { capsules } = nearby;
  const frames = useMemo(
    () =>
      position
        ? capsules.map((c) => ({ id: c.id, title: c.title, lat: c.lat, lng: c.lng, heading: c.heading, thumbUrl: c.thumb_url, ...frameState(c, position) }))
        : [],
    [capsules, position],
  );

  // 반경 밖·정확도 나쁨은 서버를 부르지 않고 안내만 띄운다
  const onTap = (id: string) => {
    const capsule = capsules.find((c) => c.id === id);
    if (!capsule || !position) return;
    if (isLowAccuracy(position.accuracy)) return setNotice({ kind: 'open_remeasure' });
    const { openable, remainingM } = frameState(capsule, position);
    if (!openable) return setNotice({ kind: 'out_of_range', remainingM });
    setNotice(null);
    setOpened({ capsule, position });
  };

  // 0 이상 360 미만 정수 (게시 검증 범위)
  const facing = (from: LatLng, to: LatLng) => Math.round(bearingDeg(from, to)) % 360;

  const closeDrop = () => {
    setDropOpen(false);
    setAnchor(null);
    setPlace(null);
  };

  // W-07 "다음": 내 위치 3m 북쪽에서 시작한다 (ArScene이 보는 방향 앞으로 다시 알린다)
  const startPlacing = (file: File) => {
    const here = useArStore.getState().position;
    if (!here) return;
    const at = offsetToLatLng(here, 0, 3);
    setPlace({ at, heading: facing(at, here), touched: false, file });
  };

  // ArScene이 알린 바닥 지점을 내 위치에서 배치 반경(PRM-20) 안으로 줄여 프레임 좌표로 쓴다
  const onPlaceMove = (target: LatLng) => {
    if (!position) return;
    const o = latLngToOffset(position, target);
    const c = clampOffset(o.eastM, o.northM, PRM_20_DROP_PLACE_RADIUS_M);
    const at = offsetToLatLng(position, c.eastM, c.northM);
    setPlace((p) => p && { ...p, at, heading: p.touched ? p.heading : facing(at, position) });
  };

  // 앵커 자리·방향은 프레임, 정확도·user 좌표는 놓는 순간의 내 위치
  const confirmPlace = () => {
    const now = useArStore.getState().position;
    if (!place) return;
    if (!now || isLowAccuracy(now.accuracy)) return setNotice({ kind: 'drop_remeasure' });
    setAnchor({ lat: place.at.lat, lng: place.at.lng, accuracy: now.accuracy, heading: place.heading, user_lat: now.lat, user_lng: now.lng });
    setPlace(null);
  };

  let status: string | null = null;
  if (geoError) status = geoError;
  else if (nearby.error) status = messageOf(nearby.error);
  else if (nearby.isFetching) status = '주변 확인 중…';
  else if (position && capsules.length === 0 && !nearby.isFirstLoad) status = '주변에 캡슐이 없어요. 첫 캡슐을 남겨 보세요';

  return (
    <div className={styles.screen}>
      <Suspense fallback={null}>
        <ArScene
          frames={frames}
          onTap={onTap}
          placeAt={place?.at ?? null}
          placeHeading={place?.heading ?? 0}
          placeImage={placeImage}
          onPlaceMove={onPlaceMove}
        />
      </Suspense>
      <AccuracyBanner visible={position != null && isLowAccuracy(position.accuracy)} />
      {position && !opened && <MiniMap position={position} points={frames} />}
      {status && !place && <p className={styles.status}>{status}</p>}
      {place && (
        <PlaceBar
          distanceM={position ? distanceM(position, place.at) : 0}
          heading={place.heading}
          onHeading={(heading) => setPlace((p) => p && { ...p, heading, touched: true })}
          onCancel={closeDrop}
          onConfirm={confirmPlace}
        />
      )}
      {!opened && !place && <Fab open={menuOpen} onClick={() => !dropOpen && !opened && setMenuOpen((v) => !v)} />}
      {menuOpen && !dropOpen && !opened && (
        <FabMenu
          onClose={() => setMenuOpen(false)}
          onDrop={() => setDropOpen(true)}
          onNotice={setNotice}
        />
      )}
      {notice && <Notice notice={notice} onClose={() => setNotice(null)} />}
      {dropOpen && <DropSheet anchor={anchor} hidden={place != null} onPlace={startPlacing} onClose={closeDrop} />}
      {opened && <OpenView {...opened} onClose={() => setOpened(null)} onNotice={setNotice} />}
    </div>
  );
}
