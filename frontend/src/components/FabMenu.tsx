import { useLogout } from '../api/auth';
import { useRefreshNearby } from '../api/capsules';
import { messageOf } from '../api/client';
import { isLowAccuracy } from '../lib/geo';
import { useArStore } from '../stores/ar';
import { Button } from './Button';
import styles from './FabMenu.module.css';
import type { NoticeState } from './Notice';

export interface Anchor {
  lat: number;
  lng: number;
  accuracy: number;
  heading: number;
}

interface FabMenuProps {
  onClose(): void;
  onDrop(anchor: Anchor): void;
  onNotice(notice: NoticeState): void;
}

export function FabMenu({ onClose, onDrop, onNotice }: FabMenuProps) {
  const refresh = useRefreshNearby();
  const logout = useLogout();

  const scan = () => {
    void refresh();
    onClose();
  };

  const drop = () => {
    const { position, heading } = useArStore.getState();
    if (!position || isLowAccuracy(position.accuracy)) onNotice({ kind: 'drop_remeasure' });
    // ponytail: 방향 센서 값이 아직 없으면 0 (앵커 heading은 저장만 하고 렌더링에 안 씀)
    else onDrop({ lat: position.lat, lng: position.lng, accuracy: position.accuracy, heading: heading ?? 0 });
    onClose();
  };

  const doLogout = () =>
    logout.mutate(undefined, {
      onError: (error) => {
        onNotice({ kind: 'message', text: messageOf(error) });
        onClose();
      },
    });

  return (
    <>
      <div className={styles.scrim} onClick={onClose} />
      <div className={styles.menu}>
        <button type="button" className={styles.item} onClick={scan}>주변 스캔</button>
        <button type="button" className={styles.item} onClick={drop}>여기에 드롭</button>
      </div>
      <div className={styles.logout}>
        <Button variant="text" onClick={doLogout} loading={logout.isPending}>로그아웃</Button>
      </div>
    </>
  );
}
