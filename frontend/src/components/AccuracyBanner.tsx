import styles from './AccuracyBanner.module.css';

export function AccuracyBanner({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div role="status" className={styles.banner}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M12 3 2 21h20L12 3Z" />
        <path d="M12 10v5M12 18v.01" />
      </svg>
      <span>GPS 정확도가 낮아요. 드롭·열람이 막혀요</span>
    </div>
  );
}
