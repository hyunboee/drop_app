import type { ReactNode } from 'react';
import styles from './Button.module.css';

interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'text';
  loading?: boolean;
  danger?: boolean;
  type?: 'button' | 'submit';
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
}

export function Button({ variant = 'primary', loading = false, danger = false, type = 'button', disabled = false, onClick, children }: ButtonProps) {
  const off = disabled || loading;
  const cls = [styles[variant], danger && styles.danger, loading && styles.loading].filter(Boolean).join(' ');
  return (
    <button type={type} className={cls} disabled={off} aria-busy={loading || undefined} onClick={off ? undefined : onClick}>
      <span className={styles.label}>{children}</span>
      {loading && (
        <span className={styles.dots} aria-hidden="true">
          <i /><i /><i />
        </span>
      )}
    </button>
  );
}
