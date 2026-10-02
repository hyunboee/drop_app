import { PRM_20_DROP_PLACE_RADIUS_M } from '../params';
import { Button } from './Button';
import styles from './PlaceBar.module.css';

interface PlaceBarProps {
  distanceM: number;
  heading: number;
  onHeading(heading: number): void;
  onCancel(): void;
  onConfirm(): void;
}

// W-13 드롭 위치·방향 정하기: 안내·거리(①), 취소(③), 여기에 놓기(④), 방향 슬라이더(⑤)
export function PlaceBar({ distanceM, heading, onHeading, onCancel, onConfirm }: PlaceBarProps) {
  const tooFar = distanceM > PRM_20_DROP_PLACE_RADIUS_M;
  return (
    <>
      <div className={styles.guide}>
        <p className={styles.text}>프레임을 끌어 놓을 곳을 정하세요</p>
        <p className={styles.distance}>내 위치에서 {Math.round(distanceM)}m</p>
        {tooFar && <p className={styles.warn}>내 위치에서 {PRM_20_DROP_PLACE_RADIUS_M}m 안에만 놓을 수 있어요</p>}
      </div>
      <div className={styles.bottom}>
        <label className={styles.rotate}>
          <span>방향</span>
          <input
            type="range"
            min={0}
            max={359}
            step={1}
            value={heading}
            onChange={(e) => onHeading(Number(e.target.value))}
          />
          <span className={styles.degree}>{heading}°</span>
        </label>
        <div className={styles.actions}>
          <Button variant="secondary" onClick={onCancel}>취소</Button>
          <Button disabled={tooFar} onClick={onConfirm}>여기에 놓기</Button>
        </div>
      </div>
    </>
  );
}
