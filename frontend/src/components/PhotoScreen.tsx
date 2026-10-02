import type { ReactNode } from 'react';
import styles from './PhotoScreen.module.css';

interface PhotoScreenProps {
  blurred?: boolean;
  wordmark?: boolean;
  children: ReactNode;
}

export function PhotoScreen({ blurred = false, wordmark = false, children }: PhotoScreenProps) {
  return (
    <main className={styles.screen}>
      <img src="/bg-soil.jpg" alt="" className={blurred ? styles.bgBlur : styles.bg} />
      <div className={styles.read} />
      <div className={styles.content}>
        {wordmark && (
          <header className={styles.wordmark}>
            <p className={styles.display}>DROP</p>
            <p className={styles.tagline}>그 자리에 묻어 둔 기억</p>
          </header>
        )}
        {children}
      </div>
    </main>
  );
}
