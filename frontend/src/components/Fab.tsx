import styles from './Fab.module.css';

export function Fab({ open, onClick }: { open: boolean; onClick(): void }) {
  return (
    <button type="button" className={styles.fab} aria-label={open ? '메뉴 닫기' : '메뉴 열기'} onClick={onClick}>
      <svg className={open ? styles.iconOpen : styles.icon} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M12 4v16M4 12h16" />
      </svg>
    </button>
  );
}
