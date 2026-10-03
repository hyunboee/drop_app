import { clampOffset, latLngToOffset, type LatLng } from '../lib/geo';
import { PRM_01_OPEN_RADIUS_M } from '../params';
import { useArStore } from '../stores/ar';
import styles from './MiniMap.module.css';

// 미니맵 가장자리가 나타내는 거리. 더 먼 캡슐은 가장자리에 붙여 그린다
const RANGE_M = 30;
// viewBox(-50~50) 안에서 가장자리까지의 반지름
const R = 44;

export interface MiniMapPoint extends LatLng {
  id: string;
  openable: boolean;
}

export function MiniMap({ position, points }: { position: LatLng; points: MiniMapPoint[] }) {
  // 방향 센서는 자주 바뀌므로 화면 전체가 아니라 미니맵만 다시 그리게 여기서 구독한다
  const heading = useArStore((s) => (s.heading === null ? null : Math.round(s.heading)));
  return (
    <svg className={styles.map} viewBox="-50 -50 100 100" role="img" aria-label="주변 캡슐 미니맵">
      {/* 보는 방향이 위로 오게 돌린다 (방향을 모르면 북쪽이 위) */}
      <g transform={`rotate(${-(heading ?? 0)})`}>
        <circle r={(PRM_01_OPEN_RADIUS_M / RANGE_M) * R} className={styles.ring} />
        <text y={-R + 4} className={styles.north}>
          N
        </text>
        {points.map((p) => {
          const o = latLngToOffset(position, p);
          const c = clampOffset(o.eastM, o.northM, RANGE_M);
          return (
            <circle
              key={p.id}
              data-capsule-id={p.id}
              cx={(c.eastM / RANGE_M) * R}
              cy={(-c.northM / RANGE_M) * R}
              r="3.5"
              className={p.openable ? styles.dotIn : styles.dotOut}
            />
          );
        })}
      </g>
      <path d="M0 -6 4.5 5 0 2.5 -4.5 5Z" className={styles.me} />
    </svg>
  );
}
