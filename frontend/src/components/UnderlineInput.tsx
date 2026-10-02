import { useId } from 'react';
import styles from './UnderlineInput.module.css';

interface UnderlineInputProps {
  label: string;
  value: string;
  onChange(value: string): void;
  type?: 'text' | 'email' | 'password';
  error?: string;
  counter?: { current: number; max: number };
  autoComplete?: string;
  placeholder?: string;
}

export function UnderlineInput({ label, value, onChange, type = 'text', error, counter, autoComplete, placeholder }: UnderlineInputProps) {
  const id = useId();
  return (
    <div>
      <div className={styles.head}>
        <label htmlFor={id} className={styles.label}>{label}</label>
        {counter && <span className={styles.counter}>{counter.current}/{counter.max}</span>}
      </div>
      <input
        id={id}
        className={styles.input}
        type={type}
        value={value}
        autoComplete={autoComplete}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      {error && <p role="alert" className={styles.error}>{error}</p>}
    </div>
  );
}
