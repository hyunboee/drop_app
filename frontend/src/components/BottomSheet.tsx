import type { ReactNode } from 'react';
import styles from './BottomSheet.module.css';

interface BottomSheetProps {
  step: 1 | 2 | 3 | 4;
  onClose?(): void;
  children: ReactNode;
}

export function BottomSheet({ step, onClose, children }: BottomSheetProps) {
  return (
    <>
      <div className={styles.scrim} onClick={onClose} />
      <section className={styles.sheet}>
        <div className={styles.handle} />
        <div className={styles.head}>
          <span className={styles.dots} aria-hidden="true">
            {[1, 2, 3, 4].map((n) => (
              <i key={n} className={n === step ? styles.on : undefined} />
            ))}
          </span>
          <span className={styles.step}>{step}/4</span>
          {onClose && (
            <button type="button" className={styles.close} aria-label="시트 닫기" onClick={onClose}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          )}
        </div>
        {children}
      </section>
    </>
  );
}
