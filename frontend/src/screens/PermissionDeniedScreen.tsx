import { Button } from '../components/Button';
import { PhotoScreen } from '../components/PhotoScreen';
import { useArStore, type PermissionName } from '../stores/ar';
import { useSession } from '../stores/session';
import styles from './PermissionScreen.module.css';

const NAMES: Record<PermissionName, string> = { camera: '카메라', location: '위치', orientation: '방향 센서' };

export function PermissionDeniedScreen() {
  const denied = useArStore((s) => s.denied);

  return (
    <PhotoScreen blurred>
      <div className={styles.body}>
        <h1 className={styles.title}>AR 뷰를 사용할 수 없어요</h1>
        <p className={styles.caption}>거부된 권한:</p>
        <ul className={styles.list}>
          {denied.map((name) => (
            <li key={name}>{NAMES[name]}</li>
          ))}
        </ul>
        <p className={styles.caption}>세 권한 모두 있어야 프레임을 배치할 수 있어요</p>
        <p className={styles.caption}>권한 요청이 뜨지 않으면 브라우저 설정에서 허용한 뒤 재시도하세요</p>
      </div>
      <Button onClick={() => useSession.getState().setScreen('start')}>재시도</Button>
    </PhotoScreen>
  );
}
