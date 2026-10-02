import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { messageOf } from '../api/client';
import { useNearbyCapsules, type NearbyCapsule } from '../api/capsules';
import { AccuracyBanner } from '../components/AccuracyBanner';
import { DropSheet } from '../components/DropSheet';
import { Fab } from '../components/Fab';
import { FabMenu, type Anchor } from '../components/FabMenu';
import { Notice, type NoticeState } from '../components/Notice';
import { OpenView } from '../components/OpenView';
import { PlaceBar } from '../components/PlaceBar';
import { clampOffset, distanceM, frameState, isLowAccuracy, latLngToOffset, offsetToLatLng, toHeading, type LatLng, type OrientationLike } from '../lib/geo';
import { log } from '../lib/log';
import { PRM_20_DROP_PLACE_RADIUS_M } from '../params';
import { useArStore, type GeoPosition } from '../stores/ar';
import styles from './ArScreen.module.css';

// A-Frame은 AR 화면에 들어갈 때만 불러온다(별도 청크)
const ArScene = lazy(() => import('../ar/ArScene'));

export function ArScreen() {
  const position = useArStore((s) => s.position);
  const [menuOpen, setMenuOpen] = useState(false);
  const [drop, setDrop] = useState<Anchor | null>(null);
  // W-13 드롭 위치 정하기 중이면 프레임 좌표 (처음엔 내 위치 3m 북쪽, ArScene이 보는 방향 앞으로 다시 알린다)
  const [placeAt, setPlaceAt] = useState<LatLng | null>(null);
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

  const { capsules } = nearby;
  const frames = useMemo(
    () =>
      position
        ? capsules.map((c) => ({ id: c.id, title: c.title, lat: c.lat, lng: c.lng, thumbUrl: c.thumb_url, ...frameState(c, position) }))
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

  const startPlacing = (start: Anchor) => setPlaceAt(offsetToLatLng(start, 0, 3));

  // ArScene이 알린 바닥 지점을 내 위치에서 배치 반경(PRM-20) 안으로 줄여 프레임 좌표로 쓴다
  const onPlaceMove = (target: LatLng) => {
    if (!position) return;
    const o = latLngToOffset(position, target);
    const c = clampOffset(o.eastM, o.northM, PRM_20_DROP_PLACE_RADIUS_M);
    setPlaceAt(offsetToLatLng(position, c.eastM, c.northM));
  };

  // 앵커 자리는 프레임 좌표, 정확도·방향·user 좌표는 놓는 순간의 내 위치
  const confirmPlace = () => {
    const { position: now, heading } = useArStore.getState();
    if (!placeAt) return;
    if (!now || isLowAccuracy(now.accuracy)) return setNotice({ kind: 'drop_remeasure' });
    setPlaceAt(null);
    setDrop({ lat: placeAt.lat, lng: placeAt.lng, accuracy: now.accuracy, heading: heading ?? 0, user_lat: now.lat, user_lng: now.lng });
  };

  let status: string | null = null;
  if (geoError) status = geoError;
  else if (nearby.error) status = messageOf(nearby.error);
  else if (nearby.isFetching) status = '주변 확인 중…';
  else if (position && capsules.length === 0 && !nearby.isFirstLoad) status = '주변에 캡슐이 없어요. 첫 캡슐을 남겨 보세요';

  return (
    <div className={styles.screen}>
      <Suspense fallback={null}>
        <ArScene frames={frames} onTap={onTap} placeAt={placeAt} onPlaceMove={onPlaceMove} />
      </Suspense>
      <AccuracyBanner visible={position != null && isLowAccuracy(position.accuracy)} />
      {status && !placeAt && <p className={styles.status}>{status}</p>}
      {placeAt && (
        <PlaceBar distanceM={position ? distanceM(position, placeAt) : 0} onCancel={() => setPlaceAt(null)} onConfirm={confirmPlace} />
      )}
      {!opened && !placeAt && <Fab open={menuOpen} onClick={() => !drop && !opened && setMenuOpen((v) => !v)} />}
      {menuOpen && !drop && !opened && (
        <FabMenu
          onClose={() => setMenuOpen(false)}
          onDrop={startPlacing}
          onNotice={setNotice}
        />
      )}
      {notice && <Notice notice={notice} onClose={() => setNotice(null)} />}
      {drop && <DropSheet anchor={drop} onClose={() => setDrop(null)} />}
      {opened && <OpenView {...opened} onClose={() => setOpened(null)} onNotice={setNotice} />}
    </div>
  );
}
