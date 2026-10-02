import { formatExpiry } from '../lib/text';
import { Button } from './Button';
import styles from './DropSheet.module.css';

export function DropStepDone({ title, expiresAt, onConfirm }: { title: string; expiresAt: string; onConfirm(): void }) {
  return (
    <div className={styles.done}>
      <svg className={styles.doneCheck} width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
      <p className={styles.title}>캡슐을 남겼어요</p>
      <p className={styles.body}>{title}</p>
      <p className={styles.caption}>{formatExpiry(expiresAt)}</p>
      <Button onClick={onConfirm}>확인</Button>
    </div>
  );
}
