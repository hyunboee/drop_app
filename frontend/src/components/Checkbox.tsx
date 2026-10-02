import { Button } from './Button';
import styles from './Checkbox.module.css';

interface CheckboxProps {
  label: string;
  checked: boolean;
  onChange(checked: boolean): void;
  onViewTerms?(): void;
}

export function Checkbox({ label, checked, onChange, onViewTerms }: CheckboxProps) {
  return (
    <div className={styles.row}>
      <label className={styles.label}>
        <input type="checkbox" className={styles.box} checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span>{label}</span>
      </label>
      {onViewTerms && <Button variant="text" onClick={onViewTerms}>전문 보기</Button>}
    </div>
  );
}
