import { formatRemaining } from '../lib/geo';
import { Button } from './Button';
import styles from './Notice.module.css';

export type NoticeState =
  | { kind: 'out_of_range'; remainingM: number }
  | { kind: 'open_remeasure' }
  | { kind: 'drop_remeasure' }
  | { kind: 'not_found' }
  | { kind: 'message'; text: string };

function body(n: NoticeState) {
  switch (n.kind) {
    case 'out_of_range':
      return (
        <>
          <span className={styles.distance}>{formatRemaining(n.remainingM)}</span> 더 가까이 가야 열 수 있어요
        </>
      );
    case 'open_remeasure':
      return 'GPS 정확도가 낮아 열 수 없어요. 잠시 후 다시 시도해 주세요';
    case 'drop_remeasure':
      return 'GPS 정확도가 낮아 드롭할 수 없어요. 잠시 후 다시 시도해 주세요';
    case 'not_found':
      return '더 이상 볼 수 없는 캡슐이에요';
    case 'message':
      return n.text;
  }
}

export function Notice({ notice, onClose }: { notice: NoticeState; onClose(): void }) {
  return (
    <div className={styles.notice} role="alert">
      <p className={styles.text}>{body(notice)}</p>
      <div className={styles.action}>
        <Button variant="secondary" onClick={onClose}>닫기</Button>
      </div>
    </div>
  );
}
